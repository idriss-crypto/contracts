// Run `npx hardhat compile` to create types folder
import {
    Tipping as TippingInterface,
    MockNFT as MockNFTInterface,
    MockToken as MockTokenInterface,
    NativePriceAggregatorV3Mock as NativePriceAggregatorV3MockInterface,
    NativePriceAggregatorV3SequencerMock as NativePriceAggregatorV3SequencerMockInterface,
    MockEAS as MockEASInterface,
    MockERC1155 as MockERC1155Interface,
} from "../types";

import { AddressLike } from 'ethers';

export interface ExtendedTipping extends TippingInterface {
    address: AddressLike;
}

export interface ExtendedMockNFT extends MockNFTInterface {
    address: AddressLike;
}

export interface ExtendedMockToken extends MockTokenInterface {
    address: AddressLike;
}

export interface ExtendedNativePriceAggregatorV3Mock extends NativePriceAggregatorV3MockInterface {
    address: AddressLike;
}

export interface ExtendedNativePriceAggregatorV3SequencerMock extends NativePriceAggregatorV3SequencerMockInterface {
    address: AddressLike;
}

export interface ExtendedMockEAS extends MockEASInterface {
    address: AddressLike;
}

export interface ExtendedMockERC1155 extends MockERC1155Interface {
    address: AddressLike;
}