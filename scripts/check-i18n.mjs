import fs from "node:fs";
const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const flat = (o, prefix = "") =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? flat(v, prefix ? prefix + "." + k : k)
      : [prefix ? prefix + "." + k : k]
  );
const ru = flat(load("src/messages/ru.json")).sort();
const az = flat(load("src/messages/az.json")).sort();
const missing = ru.filter((k) => !az.includes(k));
const extra = az.filter((k) => !ru.includes(k));
console.log("ключей ru:", ru.length, "| az:", az.length);
console.log("нет в az:", missing.length ? missing : "—");
console.log("лишние в az:", extra.length ? extra : "—");
if (missing.length || extra.length) process.exit(1);
