import { z } from 'zod';

const enc = new TextEncoder();
const dec = new TextDecoder();
export const probeA: Uint8Array = enc.encode('abc');
export const probeB: string = dec.decode(probeA);
export const probeC: string = String.fromCharCode(97);
export const probeSchema = z.string();