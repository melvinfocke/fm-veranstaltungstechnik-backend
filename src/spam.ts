import { Request } from 'express';
import cron from 'node-cron';
import { z } from 'zod';
import { zISODateTime } from './validate';

const spamList: Map<string, number> = new Map();

export const verify = async (req: Request) => {
  let spamReasons: string[] = [];

  const ip = req.ip || '';
  let count = spamList.get(ip) || 0;
  const js = isJavaScriptEnabled(req);
  const eu = await isInEuropeanUnion(req);

  count += 1;

  if (count > 5) {
    spamReasons.push('Too many requests within a day');
    if (!js) spamReasons.push('JavaScript is disabled');
    if (!eu) spamReasons.push('Not in European Union');
    return {
      rejectStatus: 429,
      rejectMessage: 'Too many requests within a day',
      spam: true,
      spamReasons
    };
  }

  spamList.set(ip, count);

  if (count > 2) {
    spamReasons.push('More than 2 requests within a day');
    if (!js) spamReasons.push('JavaScript is disabled');
    if (!eu) spamReasons.push('Not in European Union');
    return { rejectStatus: 0, rejectMessage: undefined, spam: true, spamReasons };
  }

  if (!js) spamReasons.push('JavaScript is disabled');
  if (!eu) spamReasons.push('Not in European Union');
  return { rejectStatus: 0, rejectMessage: undefined, spam: !js || !eu, spamReasons };
};

cron.schedule('0 0 * * *', () => spamList.clear());

const isJavaScriptEnabled = (req: Request) => {
  return z
    .object({
      timestamp: zISODateTime('timestamp')
    })
    .safeParse(req.body).success;
};

const isInEuropeanUnion = async (req: Request) => {
  const ip = req.ip || '';
  try {
    const res = await fetch(`https://ipinfo.f3e.network/api/${ip}`);
    return ((await res.json())?.location?.is_in_european_union ?? true) as boolean;
  } catch (error) {
    console.error(error);
    return false;
  }
};
