import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';

export namespace DefiKingdomsV2Config {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    defikingdomsRouterAddress: (chain: string, network: string) => string;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'defikingdomsv2.allowedSlippage'
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      'defikingdomsv2.gasLimitEstimate'
    ),
    ttl: ConfigManagerV2.getInstance().get('defikingdomsv2.ttl'),
    defikingdomsRouterAddress: (chain: string, network: string) =>
      ConfigManagerV2.getInstance().get(
        `defikingdomsv2.contractAddresses.${chain}.${network}.defikingdomsRouterAddress`
      ),
    tradingTypes: ['AMM'],
    chainType: 'EVM',
    availableNetworks: [
      { chain: 'dfkchain', networks: ['mainnet'] },
      { chain: 'klaytn', networks: ['mainnet'] },
      { chain: 'harmony', networks: ['mainnet'] },
    ],
  };
}
