import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';

export namespace DfkCrystalvaleConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    routerAddress: (chain: string, network: string) => string;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'dfk_crystalvale.allowedSlippage'
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      'dfk_crystalvale.gasLimitEstimate'
    ),
    ttl: ConfigManagerV2.getInstance().get('dfk_crystalvale.ttl'),
    routerAddress: (chain: string, network: string) =>
      ConfigManagerV2.getInstance().get(
        `dfk_crystalvale.contractAddresses.${chain}.${network}.routerAddress`
      ),
    tradingTypes: ['AMM'],
    chainType: 'EVM',
    availableNetworks: [{ chain: 'dfkchain', networks: ['mainnet'] }],
  };
}
