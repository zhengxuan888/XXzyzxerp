import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const options = { mode: "local", file: ".env" };
  for (const arg of argv) {
    if (arg.startsWith("--mode=")) options.mode = arg.slice("--mode=".length);
    if (arg.startsWith("--file=")) options.file = arg.slice("--file=".length);
  }
  if (!["local", "staging"].includes(options.mode)) {
    throw new Error("mode 必须是 local 或 staging");
  }
  return options;
}

function parseEnvFile(filePath) {
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function isPlaceholder(value = "") {
  return /replace|example\.com|<[^>]+>|changeme|your[-_]/i.test(value);
}

function parseUrl(name, value, protocols, errors) {
  try {
    const parsed = new URL(value);
    if (!protocols.includes(parsed.protocol)) {
      errors.push(`${name} 协议必须是 ${protocols.join(" / ")}`);
    }
    return parsed;
  } catch {
    errors.push(`${name} 不是有效 URL`);
    return null;
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(process.cwd(), options.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`配置文件不存在：${options.file}`);
  }

  const localDefaultsPath = path.resolve(process.cwd(), ".env.example");
  const localDefaults =
    options.mode === "local" && fs.existsSync(localDefaultsPath)
      ? parseEnvFile(localDefaultsPath)
      : {};
  const config = { ...localDefaults, ...parseEnvFile(filePath), ...process.env };
  const errors = [];
  const warnings = [];
  const required = [
    "NODE_ENV",
    "APP_BASE_URL",
    "PORT",
    "DATABASE_URL",
    "REDIS_URL",
    "SESSION_SECRET",
    "INTEGRATION_CREDENTIAL_MASTER_KEY",
    "SESSION_TTL_SECONDS",
    "STORAGE_PROVIDER",
  ];

  for (const key of required) {
    if (!config[key]) errors.push(`缺少 ${key}`);
  }

  const baseUrl = parseUrl("APP_BASE_URL", config.APP_BASE_URL, ["http:", "https:"], errors);
  const databaseUrl = parseUrl("DATABASE_URL", config.DATABASE_URL, ["postgresql:", "postgres:"], errors);
  const redisUrl = parseUrl("REDIS_URL", config.REDIS_URL, ["redis:", "rediss:"], errors);
  const sessionTtl = Number(config.SESSION_TTL_SECONDS);
  const port = Number(config.PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push("PORT 必须是 1-65535 的整数");
  if (!Number.isInteger(sessionTtl) || sessionTtl < 300 || sessionTtl > 86400) {
    errors.push("SESSION_TTL_SECONDS 必须是 300-86400 的整数");
  }
  if ((config.SESSION_SECRET ?? "").length < 32) errors.push("SESSION_SECRET 至少需要 32 个字符");
  if ((config.INTEGRATION_CREDENTIAL_MASTER_KEY ?? "").length < 32) errors.push("INTEGRATION_CREDENTIAL_MASTER_KEY 至少需要 32 个字符");

  if (options.mode === "local") {
    if (config.NODE_ENV !== "development") warnings.push("本地模式建议 NODE_ENV=development");
    if (isPlaceholder(config.SESSION_SECRET)) warnings.push("SESSION_SECRET 仍是占位值，只允许本地演示");
    if (isPlaceholder(config.INTEGRATION_CREDENTIAL_MASTER_KEY)) warnings.push("接口凭据主密钥仍是占位值，只允许本地演示");
    if (config.STORAGE_PROVIDER !== "LOCAL_DEMO") warnings.push("本地模式通常使用 LOCAL_DEMO");
  } else {
    if (config.NODE_ENV !== "production") errors.push("预发布必须使用 NODE_ENV=production");
    if (baseUrl?.protocol !== "https:") errors.push("预发布 APP_BASE_URL 必须使用 HTTPS");
    if (redisUrl?.protocol !== "rediss:") errors.push("预发布 REDIS_URL 必须使用 TLS（rediss）");
    if (config.STORAGE_PROVIDER === "LOCAL_DEMO") errors.push("预发布禁止使用 LOCAL_DEMO 存储");
    for (const key of required) {
      if (isPlaceholder(config[key])) errors.push(`${key} 仍包含占位值`);
    }
    for (const parsed of [databaseUrl, redisUrl]) {
      if (parsed && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
        errors.push("预发布数据库和 Redis 不得指向本机地址");
      }
    }
  }

  console.log(`配置校验模式：${options.mode}`);
  console.log(`配置文件：${options.file}`);
  for (const warning of warnings) console.warn(`警告：${warning}`);
  if (errors.length > 0) {
    for (const error of errors) console.error(`错误：${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("配置校验通过（未输出任何 Secret）。");
}

try {
  main();
} catch (error) {
  console.error(`配置校验失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
