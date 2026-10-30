import { generateToken, requireToken } from "@jarvis/core";

export function runToken(opts: { rotate?: boolean }): void {
  if (opts.rotate) {
    console.log(generateToken());
    console.error("Rotated: the previous token is now invalid — update anything that used it.");
    return;
  }
  console.log(requireToken());
}
