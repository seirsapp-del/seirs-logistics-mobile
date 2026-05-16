import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res, UseGuards,
  Headers,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiKeyGuard } from './api-key.guard';
import { V1Service, V1OrderInput, V1QuoteInput } from './v1.service';

// Spec V8 Tier 3 — public Developer Platform API. All requests
// authenticated via the ApiKeyGuard (Bearer sk_(live|test)_xxx).
//
// Stable URL prefix: /api/v1/*  (the /api prefix comes from the
// global app prefix in main.ts; the /v1 prefix lives here so we
// can ship /v2 later without breaking partners).
//
// Idempotency-Key header is honored on every POST: a repeated request
// within 24h returns the cached response instead of double-creating.

@UseGuards(ApiKeyGuard)
@Controller('v1')
export class V1Controller {
  constructor(private readonly svc: V1Service) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  async quote(
    @Body() body: V1QuoteInput,
    @Req()  req: Request,
    @Headers('idempotency-key') idemKey: string,
  ) {
    const cached = await this.svc.findIdempotent(req.apiKey!.id, idemKey, 'POST /v1/quote');
    if (cached) return cached.responseBody;
    const result = await this.svc.quote(body);
    await this.svc.storeIdempotent(req.apiKey!.id, idemKey, 'POST /v1/quote', 200, result);
    return result;
  }

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @Body() body: V1OrderInput,
    @Req()  req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') idemKey: string,
  ) {
    const cached = await this.svc.findIdempotent(req.apiKey!.id, idemKey, 'POST /v1/orders');
    if (cached) {
      res.status(cached.responseStatus);
      return cached.responseBody;
    }
    const result = await this.svc.createOrder(req.apiKey!, body);
    await this.svc.storeIdempotent(req.apiKey!.id, idemKey, 'POST /v1/orders', 201, result);
    return result;
  }

  @Get('orders/:id')
  getOrder(@Param('id') id: string, @Req() req: Request) {
    return this.svc.getOrder(req.apiKey!, id);
  }

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelOrder(@Param('id') id: string, @Req() req: Request) {
    return this.svc.cancelOrder(req.apiKey!, id);
  }
}
