import { Controller, Get, Header } from "@nestjs/common";
import { renderWalkthroughPage } from "./walkthrough-page.js";

@Controller()
export class WalkthroughController {
  @Get()
  @Header("Content-Type", "text/html; charset=utf-8")
  home(): string {
    return renderWalkthroughPage();
  }

  @Get("walkthrough")
  @Header("Content-Type", "text/html; charset=utf-8")
  walkthrough(): string {
    return renderWalkthroughPage();
  }
}
