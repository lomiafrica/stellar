import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { runReconcile } from "../ops/reconcile-job.js";
import { renderReconcilePage } from "../ops/pages.js";
import {
  closeReview,
  latestReconcileRun,
  readReviewQueue,
  reconcileRunsSince,
} from "../ops/reconcile-store.js";
import { assertLabMutatingAuth } from "./lab-auth.js";
import { prefersHtml } from "./page-chrome.js";

function pageOrJson(
  req: Request,
  res: Response,
  title: string,
  lede: string,
  json: unknown,
): unknown {
  if (!prefersHtml(req)) return json;
  res.type("html");
  const latest = latestReconcileRun();
  return renderReconcilePage({
    title,
    lede,
    latest,
    runs: reconcileRunsSince(14),
    review: readReviewQueue(),
  });
}

@Controller("ops")
export class OpsController {
  @Get("reconcile")
  home(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return pageOrJson(
      req,
      res,
      "Reconcile",
      "Daily three-way check of the lab ledger, Stellar, and Bridge. Breaks stay in the review queue until someone closes them.",
      latestReconcileRun() ?? { ok: true, rows: 0, runs: 0 },
    );
  }

  @Get("reconcile/latest")
  latest(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const latest = latestReconcileRun();
    return pageOrJson(
      req,
      res,
      "Latest reconcile",
      "The newest scheduled or manual run.",
      latest ?? { ok: true, rows: 0, runs: 0 },
    );
  }

  @Get("reconcile/runs")
  runs(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("days") days?: string,
  ) {
    const window = Number(days ?? "14");
    const rows = reconcileRunsSince(window);
    return pageOrJson(
      req,
      res,
      "Reconcile runs",
      `Runs from the last ${Number.isFinite(window) ? window : 14} days.`,
      { days: window, runs: rows },
    );
  }

  @Get("reconcile/review")
  review(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const queue = readReviewQueue();
    return pageOrJson(
      req,
      res,
      "Reconcile review",
      "Open breaks are not auto-resolved.",
      { review: queue },
    );
  }

  @Post("reconcile/run")
  async run(
    @Headers("x-lab-key") labKey?: string,
    @Headers("authorization") authorization?: string,
  ) {
    assertLabMutatingAuth(labKey, authorization);
    return runReconcile();
  }

  @Post("reconcile/review/:payout_id/close")
  close(
    @Param("payout_id") payoutId: string,
    @Body() body: { note?: string },
    @Headers("x-lab-key") labKey?: string,
    @Headers("authorization") authorization?: string,
  ) {
    assertLabMutatingAuth(labKey, authorization);
    const note = body.note?.trim() ?? "";
    if (!note) {
      throw new BadRequestException("A note is required to close a review item.");
    }
    const closed = closeReview(payoutId, note);
    if (!closed) {
      throw new NotFoundException(`No review item for ${payoutId}`);
    }
    return closed;
  }
}
