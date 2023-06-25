import { UniswapishPriceError } from '../../services/error-handler';
import { DfkCrystalvaleConfig } from './dfk_crystalvale.config';
import routerAbi from './defikingdoms_router.json';
import { ContractInterface } from '@ethersproject/contracts';
import { isFractionString } from '../../services/validators';

import {
  Router as dfkchainRouter,
  Pair as dfkchainPair,
  SwapParameters,
  Trade as dfkchainTrade,
  Fetcher as dfkchainFetcher,
} from '../../../dfk-connector-sdk/dfkchain-sdk/dist';

import { Percent, Token, CurrencyAmount, TradeType } from '@uniswap/sdk-core';

import { ExpectedTrade, Uniswapish } from '../../services/common-interfaces';
import { DfkChain } from '../../chains/dfkchain/dfkchain';

import {
  BigNumber,
  Wallet,
  Transaction,
  Contract,
  ContractTransaction,
} from 'ethers';
import { percentRegexp } from '../../services/config-manager-v2';
import { logger } from '../../services/logger';

export class DfkCrystalvale implements Uniswapish {
  private static _instances: { [name: string]: DfkCrystalvale };
  private chain: DfkChain;

  private _router: string;
  private _routerAbi: ContractInterface;
  private _gasLimitEstimate: number;
  private _ttl: number;
  private chainId;
  private tokenList: Record<string, Token> = {};
  private _ready: boolean = false;

  private _factory: string;
  private _initCodeHash: string;

  private constructor(chain: string, network: string) {
    const config = DfkCrystalvaleConfig.config;

    this.chain = DfkChain.getInstance(network);
    this._factory = '0x794C07912474351b3134E6D6B3B7b3b4A07cbAAa';
    this._initCodeHash =
      '0x4abbeda7e0705baf5222faead952156d4eb4113795d3dd837895a00ff89f5717';

    this.chainId = this.chain.chainId;
    this._ttl = config.ttl;
    this._routerAbi = routerAbi;
    this._gasLimitEstimate = config.gasLimitEstimate;
    this._router = config.routerAddress(chain, network);
  }

  public static getInstance(chain: string, network: string): DfkCrystalvale {
    if (DfkCrystalvale._instances === undefined) {
      DfkCrystalvale._instances = {};
    }
    if (!(chain + network in DfkCrystalvale._instances)) {
      DfkCrystalvale._instances[chain + network] = new DfkCrystalvale(
        chain,
        network
      );
    }

    return DfkCrystalvale._instances[chain + network];
  }

  /**
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  public getTokenByAddress(address: string): Token {
    return this.tokenList[address];
  }
  public async init() {
    if (!this.chain.ready()) {
      await this.chain.init();
    }
    for (const token of this.chain.storedTokenList) {
      this.tokenList[token.address] = new Token(
        this.chainId,
        token.address,
        token.decimals,
        token.symbol,
        token.name
      );
    }
    this._ready = true;
  }

  public ready(): boolean {
    return this._ready;
  }

  /**
   * Router address.
   */
  public get router(): string {
    return this._router;
  }

  /**
   * Router smart contract ABI.
   */
  public get routerAbi(): ContractInterface {
    return this._routerAbi;
  }

  /**
   * Default gas limit for swap transactions.
   */
  public get gasLimitEstimate(): number {
    return this._gasLimitEstimate;
  }

  /**
   * Default time-to-live for swap transactions, in seconds.
   */
  public get ttl(): number {
    return this._ttl;
  }

  /**
   * Gets the allowed slippage percent from the optional parameter or the value
   * in the configuration.
   *
   * @param allowedSlippageStr (Optional) should be of the form '1/10'.
   */
  public getAllowedSlippage(allowedSlippageStr?: string): Percent {
    if (allowedSlippageStr != null && isFractionString(allowedSlippageStr)) {
      const fractionSplit = allowedSlippageStr.split('/');
      return new Percent(fractionSplit[0], fractionSplit[1]);
    }

    const allowedSlippage = DfkCrystalvaleConfig.config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    if (nd) return new Percent(nd[1], nd[2]);
    throw new Error(
      'Encountered a malformed percent string in the config for ALLOWED_SLIPPAGE.'
    );
  }

  /**
   * Given the amount of `baseToken` to put into a transaction, calculate the
   * amount of `quoteToken` that can be expected from the transaction.
   *
   * This is typically used for calculating token sell prices.
   *
   * @param baseToken Token input for the transaction
   * @param quoteToken Output from the transaction
   * @param amount Amount of `baseToken` to put into the transaction
   */
  async estimateSellTrade(
    baseToken: Token,
    quoteToken: Token,
    amount: BigNumber,
    allowedSlippage?: string
  ): Promise<ExpectedTrade> {
    const baseTokenAmount = CurrencyAmount.fromRawAmount(
      baseToken,
      amount.toString()
    );

    logger.info(
      `Fetching pair data for ${baseToken.address}-${quoteToken.address}.`
    );

    const pair: dfkchainPair = await this.fetchPairData(quoteToken, baseToken);
    const trades: dfkchainTrade<Token, Token, TradeType.EXACT_INPUT>[] =
      dfkchainTrade.bestTradeExactIn([pair], baseTokenAmount, quoteToken, {
        maxHops: 1,
      });
    if (!trades || trades.length === 0) {
      throw new UniswapishPriceError(
        `priceSwapIn: no trade pair found for ${baseToken.address} to ${quoteToken.address}.`
      );
    }
    logger.info(
      `Best trade for ${baseToken.address}-${quoteToken.address}: ` +
      `${trades[0].executionPrice.toFixed(6)}` +
      `${baseToken.name}.`
    );
    const expectedAmount = trades[0].minimumAmountOut(
      this.getAllowedSlippage(allowedSlippage)
    );
    return { trade: trades[0], expectedAmount };
  }

  /**
   * Given the amount of `baseToken` desired to acquire from a transaction,
   * calculate the amount of `quoteToken` needed for the transaction.
   *
   * This is typically used for calculating token buy prices.
   *
   * @param quoteToken Token input for the transaction
   * @param baseToken Token output from the transaction
   * @param amount Amount of `baseToken` desired from the transaction
   */
  async estimateBuyTrade(
    quoteToken: Token,
    baseToken: Token,
    amount: BigNumber,
    allowedSlippage?: string
  ): Promise<ExpectedTrade> {
    const baseTokenAmount = CurrencyAmount.fromRawAmount(
      baseToken,
      amount.toString()
    );
    logger.info(
      `Fetching pair data for ${quoteToken.address}-${baseToken.address}.`
    );
    const pair: dfkchainPair = await this.fetchPairData(quoteToken, baseToken);
    const trades: dfkchainTrade<Token, Token, TradeType.EXACT_OUTPUT>[] =
      dfkchainTrade.bestTradeExactOut([pair], quoteToken, baseTokenAmount, {
        maxHops: 1,
      });
    if (!trades || trades.length === 0) {
      throw new UniswapishPriceError(
        `priceSwapOut: no trade pair found for ${quoteToken.address} to ${baseToken.address}.`
      );
    }
    logger.info(
      `Best trade for ${quoteToken.address}-${baseToken.address}: ` +
      `${trades[0].executionPrice.invert().toFixed(6)} ` +
      `${baseToken.name}.`
    );

    const expectedAmount = trades[0].maximumAmountIn(
      this.getAllowedSlippage(allowedSlippage)
    );
    return { trade: trades[0], expectedAmount };
  }

  /**
   * Given a wallet and a defira trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   * @param gasPrice Base gas price, for pre-EIP1559 transactions
   * @param dfkRouter Router smart contract address
   * @param ttl How long the swap is valid before expiry, in seconds
   * @param abi Router contract ABI
   * @param gasLimit Gas limit
   * @param nonce (Optional) EVM transaction nonce
   */
  async executeTrade(
    wallet: Wallet,
    trade: dfkchainTrade<Token, Token, TradeType>,
    gasPrice: number,
    dfkRouter: string,
    ttl: number,
    abi: ContractInterface,
    gasLimit: number,
    nonce?: number,
    _1?: BigNumber,
    _2?: BigNumber,
    allowedSlippage?: string
  ): Promise<Transaction> {
    const result: SwapParameters = dfkchainRouter.swapCallParameters(trade, {
      ttl,
      recipient: wallet.address,
      allowedSlippage: this.getAllowedSlippage(allowedSlippage),
    });

    const contract: Contract = new Contract(dfkRouter, abi, wallet);
    return this.chain.nonceManager.provideNonce(
      nonce,
      wallet.address,
      async (nextNonce) => {
        const tx: ContractTransaction = await contract[result.methodName](
          ...result.args,
          {
            gasPrice: (gasPrice * 1e9).toFixed(0),
            gasLimit: gasLimit.toFixed(0),
            value: result.value,
            nonce: nextNonce,
          }
        );

        logger.info(JSON.stringify(tx));
        return tx;
      }
    );
  }

  async fetchPairData(tokenA: Token, tokenB: Token): Promise<dfkchainPair> {
    return await dfkchainFetcher.fetchPairData(
      tokenA,
      tokenB,
      this._factory,
      this._initCodeHash
    );
  }
}
