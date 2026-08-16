import { Horizon } from '@stellar/stellar-sdk';
import { rpc } from '@stellar/stellar-sdk';
import { STELLAR_HORIZON_URL, STELLAR_RPC_URL } from '../config.js';

export function getRpcServer(): rpc.Server {
  return new rpc.Server(STELLAR_RPC_URL, { allowHttp: true });
}

export function getHorizonServer(): Horizon.Server {
  return new Horizon.Server(STELLAR_HORIZON_URL, { allowHttp: true });
}
