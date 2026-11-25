import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { context, createServer, getServerPort, reddit, redis } from '@devvit/web/server';
import type { TriggerResponse, UiResponse } from '@devvit/web/shared';
import type { MessageResponse } from '../shared/skein/api.ts';
import { dayFor, parFor } from '../shared/skein/rules.ts';
import { makeSky } from '../shared/skein/sky.ts';
import { K, commentFor, flairFor, initFor, meFor, splashFor, submitFlight } from './store.ts';

const dayForThisPost = async (): Promise<number> => {
  const fromData = context.postData?.day;
  if (typeof fromData === 'number' && Number.isInteger(fromData) && fromData > 0) return fromData;
  if (context.postId) {
    const stored = Number(await redis.get(K.post(context.postId)));
    if (Number.isInteger(stored) && stored > 0) return stored;
  }
  return dayFor(Date.now());
};

const createLegPost = async (day: number) => {
  const sky = makeSky(day);
  const post = await reddit.submitCustomPost({
    title: `Skein · Leg ${day}: ${sky.region} to ${sky.lake}. Ride the wake of everyone who flew before you.`,
    postData: { day },
    textFallback: {
      text: 'Skein is a daily flight. Fly one leg of the migration before dark. Every goose that flew before you leaves a wake you can ride, and your flight carries everyone after you. Open this post on new Reddit or the Reddit app to fly.',
    },
  });
  await redis.set(K.post(post.id), String(day));
  await redis.set(K.posted(day), post.id);
  return post;
};

const postUrl = (postId: string) => `https://reddit.com/r/${context.subredditName}/comments/${postId.replace(/^t3_/, '')}`;

const readBody = async (req: { json: () => Promise<unknown> }): Promise<unknown> => {
  try {
    return await req.json();
  } catch {
    return null;
  }
};

const app = new Hono();

app.get('/api/splash', async (c) => {
  const day = await dayForThisPost();
  return c.json(await splashFor(redis, day, context.username ?? null, Date.now()));
});

app.get('/api/init', async (c) => {
  const day = await dayForThisPost();
  return c.json(await initFor(redis, day, context.username ?? null, Date.now()));
});

app.post('/api/flight', async (c) => {
  const day = await dayForThisPost();
  const name = context.username ?? null;
  const result = await submitFlight(redis, day, name, await readBody(c.req), Date.now());
  if (result.ok && result.arrived && result.improved && name && context.subredditName) {
    try {
      await reddit.setUserFlair({
        subredditName: context.subredditName,
        username: name,
        text: flairFor(result.streak, result.carried),
        backgroundColor: '#c2562c',
        textColor: 'light',
      });
    } catch (error) {
      console.error('Flair failed', error);
    }
  }
  return c.json(result, result.ok ? 200 : 400);
});

app.post('/api/comment', async (c) => {
  const name = context.username;
  const postId = context.postId;
  if (!name || !postId) return c.json<MessageResponse>({ ok: false, message: 'Log in to share.' }, 400);
  const day = await dayForThisPost();
  const me = await meFor(redis, day, dayFor(Date.now()), name);
  if (!me.best) return c.json<MessageResponse>({ ok: false, message: 'Reach the lake first.' });
  if (!(await redis.hSetNX(K.commented(day), name, '1'))) return c.json<MessageResponse>({ ok: false, message: 'Already shared this leg.' });
  await redis.expire(K.commented(day), 60 * 60 * 24 * 30);
  try {
    const sky = makeSky(day);
    const rode = (await redis.zRange(K.carried(day), 0, 50, { reverse: true, by: 'rank' }))
      .map((m) => m.member)
      .filter((m) => m !== name);
    const mine: string[] = [];
    for (const ghost of rode) {
      if (mine.length >= 3) break;
      if (await redis.hGet(K.rode(day, ghost), name)) mine.push(ghost);
    }
    await reddit.submitComment({
      id: postId,
      text: commentFor(day, sky.region, sky.lake, me.best, parFor(), me.carried, mine),
      runAs: 'USER',
    });
    return c.json<MessageResponse>({ ok: true, message: 'Shared in the thread.' });
  } catch (error) {
    console.error('Comment failed', error);
    return c.json<MessageResponse>({ ok: false, message: 'Could not post the comment.' }, 500);
  }
});

app.post('/api/subscribe', async (c) => {
  if (!context.username) return c.json<MessageResponse>({ ok: false, message: 'Log in to join.' }, 400);
  try {
    await reddit.subscribeToCurrentSubreddit();
    return c.json<MessageResponse>({ ok: true, message: 'Joined. See you on the next leg.' });
  } catch (error) {
    console.error('Subscribe failed', error);
    return c.json<MessageResponse>({ ok: false, message: 'Could not join right now.' }, 500);
  }
});

app.post('/internal/menu/post-create', async (c) => {
  const day = dayFor(Date.now());
  try {
    const existing = await redis.get(K.posted(day));
    const id = existing ?? (await createLegPost(day)).id;
    return c.json<UiResponse>({ navigateTo: postUrl(id) });
  } catch (error) {
    console.error('Post creation failed', error);
    return c.json<UiResponse>({ showToast: 'Could not create today’s leg' }, 400);
  }
});

app.post('/internal/scheduler/daily-post', async (c) => {
  const day = dayFor(Date.now());
  try {
    if (!(await redis.get(K.posted(day)))) await createLegPost(day);
    return c.json({ status: 'ok' });
  } catch (error) {
    console.error('Daily post failed', error);
    return c.json({ status: 'error' }, 500);
  }
});

app.post('/internal/triggers/on-app-install', async (c) => {
  const day = dayFor(Date.now());
  try {
    const existing = await redis.get(K.posted(day));
    const post = existing ? { id: existing } : await createLegPost(day);
    return c.json<TriggerResponse>({ status: 'success', message: `Post ${post.id} created` });
  } catch (error) {
    console.error('Install post failed', error);
    return c.json<TriggerResponse>({ status: 'error', message: 'Failed to create post' }, 400);
  }
});

serve({ fetch: app.fetch, createServer, port: getServerPort() });
