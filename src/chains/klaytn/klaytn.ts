import abi from '../ethereum/ethereum.abi.json';
import { logger } from '../../services/logger';
import { Contract, Transaction, Wallet } from 'ethers';
import { EthereumBase } from '../ethereum/ethereum-base';
import { getEthereumConfig as getKlaytnConfig } from '../ethereum/ethereum.config';
import { Provider } from '@ethersproject/abstract-provider';

import { DfkSerendale } from '../../connectors/dfk_serendale/dfk_serendale';

import { Ethereumish } from '../../services/common-interfaces';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export class Klaytn extends EthereumBase implements Ethereumish {
    private static _instances: { [name: string]: Klaytn };
    private _gasPrice: number;
    private _gasPriceRefreshInterval: number | null;
    private _nativeTokenSymbol: string;
    private _chain: string;

    private constructor(network: string) {
        const config = getKlaytnConfig('klaytn', network);
        super(
            'klaytn',
            config.network.chainID,
            config.network.nodeURL,
            config.network.tokenListSource,
            config.network.tokenListType,
            config.manualGasPrice,
            config.gasLimitTransaction,
            ConfigManagerV2.getInstance().get('server.nonceDbPath'),
            ConfigManagerV2.getInstance().get('server.transactionDbPath')
        );
        this._chain = config.network.name;
        this._nativeTokenSymbol = config.nativeCurrencySymbol;

        this._gasPrice = config.manualGasPrice;

        this._gasPriceRefreshInterval =
            config.network.gasPriceRefreshInterval !== undefined
                ? config.network.gasPriceRefreshInterval
                : null;

        this.updateGasPrice();
    }

    public static getInstance(network: string): Klaytn {
        if (Klaytn._instances === undefined) {
            Klaytn._instances = {};
        }
        if (!(network in Klaytn._instances)) {
            Klaytn._instances[network] = new Klaytn(network);
        }

        return Klaytn._instances[network];
    }

    public static getConnectedInstances(): { [name: string]: Klaytn } {
        return Klaytn._instances;
    }

    // getters

    public get gasPrice(): number {
        return this._gasPrice;
    }

    public get nativeTokenSymbol(): string {
        return this._nativeTokenSymbol;
    }

    public get chain(): string {
        return this._chain;
    }

    getContract(tokenAddress: string, signerOrProvider?: Wallet | Provider) {
        return new Contract(tokenAddress, abi.ERC20Abi, signerOrProvider);
    }

    getSpender(reqSpender: string): string {
        let spender: string;
        if (reqSpender === 'dfk_serendale') {
            spender = DfkSerendale.getInstance('klaytn', 'mainnet').router;
        } else {
            spender = reqSpender;
        }
        return spender;
    }

    // cancel transaction
    async cancelTx(wallet: Wallet, nonce: number): Promise<Transaction> {
        logger.info(
            'Canceling any existing transaction(s) with nonce number ' + nonce + '.'
        );
        return super.cancelTxWithGasPrice(wallet, nonce, this._gasPrice * 2);
    }

    /**
     * Automatically update the prevailing gas price on the network.
     */
    async updateGasPrice(): Promise<void> {
        if (this._gasPriceRefreshInterval === null) {
            return;
        }

        const gasPrice = await this.getGasPrice();
        if (gasPrice !== null) {
            this._gasPrice = gasPrice;
        } else {
            logger.info('gasPrice is unexpectedly null.');
        }

        setTimeout(
            this.updateGasPrice.bind(this),
            this._gasPriceRefreshInterval * 1000
        );
    }

    async close() {
        await super.close();
        if (this._chain in Klaytn._instances) {
            delete Klaytn._instances[this._chain];
        }
    }
}