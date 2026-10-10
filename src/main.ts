import "reflect-metadata";
import {
  json,
  urlencoded,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { NestFactory } from "@nestjs/core";
import { startSep6Schedule } from "./anchor/sep6-platform.js";
import { assertDeployNetwork, PORT } from "./config.js";
import { AppModule } from "./http/app.module.js";
import { corsOrigins, rateLimitOk, securityHeaders } from "./http/security.js";
import { purgeExpiredSettlements } from "./ledger/store.js";
import { log } from "./ops/log.js";
import { runReconcile, startReconcileSchedule } from "./ops/reconcile-job.js";

async function bootstrap() {
  assertDeployNetwork();
  purgeExpiredSettlements();
  await runReconcile().catch((err) => {
    log("reconcile.run", {
      ok: false,
      message: err instanceof Error ? err.message : "boot reconcile failed",
    });
  });
  startReconcileSchedule();
  startSep6Schedule();
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bodyParser: false,
  });
  app.use(
    json({
      limit: "32kb",
      verify: (req: Request, _res, buf) => {
        Object.defineProperty(req, "rawBody", {
          value: buf,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      },
    }),
  );
  app.use(urlencoded({ limit: "32kb", extended: true }));
  const origins = corsOrigins();
  app.enableCors({ origin: origins === true ? "*" : origins });
  app.use((req: Request, res: Response, next: NextFunction) => {
    for (const [key, value] of Object.entries(securityHeaders())) {
      res.setHeader(key, value);
    }
    const mutating =
      req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
    if (mutating && !rateLimitOk(req.ip ?? "unknown")) {
      res.status(429).json({ success: false, reason: "rate limit" });
      return;
    }
    next();
  });
  await app.listen(PORT, "0.0.0.0");
  console.log(`lomi. stellar testnet lab listening on http://0.0.0.0:${PORT}`);
}

bootstrap();
