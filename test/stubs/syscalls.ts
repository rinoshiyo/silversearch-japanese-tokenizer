// SilverBullet の syscall の代替。Silversearch の tokenizer の読み込み処理を Node 上で動かすために用いる。
import { readFile } from "node:fs/promises";

export const space = {
  readDocument: async (path: string): Promise<Uint8Array> => new Uint8Array(await readFile(path)),
};

export const editor = {
  flashNotification: async (_message: string): Promise<void> => {},
};

export const system = {
  getConfig: async (_key: string, fallback: unknown): Promise<unknown> => fallback,
};
