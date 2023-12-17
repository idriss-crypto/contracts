// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import { AssetType, FeeType } from "../enums/IDrissEnums.sol";

error AddressIsNull();
error ValueSentTooSmall();
error PercentageFeeTooSmall();
error PaymentFeeTooSmall();
error DenominatorTooSmall();
error MinimalFeeTooBig();
error MinimalFeePercentageTooBig();

/**
 * @title FeeCalculator
 * @author Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @custom:contributor Lennard <@lennardevertz>
 * @notice This is an utility contract for calculating a fee
 * @notice In this version we use Chainlink oracles for the fee calculation
 */
abstract contract FeeCalculator is Ownable {
    AggregatorV3Interface internal immutable NATIVE_USD_PRICE_FEED;
    AggregatorV3Interface internal immutable SEQUENCER_UPTIME_FEED;
    uint256 public NATIVE_WEI_MULTIPLIER = 10**18;
    uint256 public constant PAYMENT_FEE_SLIPPAGE_PERCENT = 5;
    uint256 public PAYMENT_FEE_PERCENTAGE = 10;
    uint256 public PAYMENT_FEE_PERCENTAGE_DENOMINATOR = 1000;
    uint256 public MINIMAL_PAYMENT_FEE = 1;
    uint256 public MINIMAL_PAYMENT_FEE_DENOMINATOR = 1;
    // you have to pass your desired fee types in a constructor deriving this contract
    mapping (AssetType => FeeType) FEE_TYPE_MAPPING;
    mapping (address => bool) supportedERC20;
    uint256 public NATIVE_USD_STALE_THRESHOLD; //  should be the update period
    int256 public FALLBACK_PRICE;
    uint256 public FALLBACK_DECIMALS;
    bool public checkSequencer;

    constructor(address _nativeUsdAggregator, address _sequencerAddress, uint256 _stalenessThreshold, int256 _fallbackFeePrice, uint256 _fallbackDecimals) {
        // ToDo: check, as simplified versions will contain no AggregatorV3Interface oracle
        if (_nativeUsdAggregator == address(0)) {
            revert AddressIsNull();
        }
        NATIVE_USD_PRICE_FEED = AggregatorV3Interface(_nativeUsdAggregator);
        SEQUENCER_UPTIME_FEED = AggregatorV3Interface(_nativeUsdAggregator);
        checkSequencer = address(0) != _sequencerAddress;
        NATIVE_USD_STALE_THRESHOLD = _stalenessThreshold;
        FALLBACK_PRICE = _fallbackFeePrice;
        FALLBACK_DECIMALS = _fallbackDecimals;
    }

    event OracleFailed(string reason);

    /*
    * @notice Get current amount of wei in a dollar
    * @dev ChainLink officially supports only USD -> NATIVE,
    *      so we have to convert it back to get current amount of wei in a dollar
    */
    function _dollarToWei() internal view returns (uint256) {
        int256 nativePrice = FALLBACK_PRICE;
        uint256 nativePriceMultiplier = 10**FALLBACK_DECIMALS;

        try NATIVE_USD_PRICE_FEED.latestRoundData() returns
            (uint80 roundId, int256 _latestPrice, uint256, uint256 _lastUpdatedAt, uint80) {
            if (_latestPrice > 0 &&
                _lastUpdatedAt != 0 &&
                (block.timestamp - _lastUpdatedAt <= NATIVE_USD_STALE_THRESHOLD)) {
                if (checkSequencer) {
                    try SEQUENCER_UPTIME_FEED.latestRoundData() returns (uint80, int256 answer, uint256 startedAt, uint256, uint80) {
                       bool isSequencerUp = answer == 0;
                       uint256 timeSinceUp = block.timestamp - startedAt;
                       if (isSequencerUp && (timeSinceUp > NATIVE_USD_STALE_THRESHOLD)) {
                            nativePrice = _latestPrice;
                            nativePriceMultiplier = 10**NATIVE_USD_PRICE_FEED.decimals();
                       }
                    } catch {
                        // Use fallback values
                    }
                } else {
                    // accept oracle values
                    nativePrice = _latestPrice;
                    nativePriceMultiplier = 10**NATIVE_USD_PRICE_FEED.decimals();
                }
            }
        } catch {
            // Use fallback values
        }
        return(NATIVE_WEI_MULTIPLIER * nativePriceMultiplier) / uint256(nativePrice);
    }

    /**
     * @notice Calculates payment fee
     * @param _value - payment value
     * @param _assetType - asset type, required as ERC20 & ERC721 only take minimal fee
     * @return fee - processing fee, few percent of slippage is allowed
     */
    function getPaymentFee(uint256 _value, AssetType _assetType) public view returns (uint256) {
        uint256 minimumPaymentFee = _getMinimumFee();
        uint256 percentageFee = _getPercentageFee(_value);
        FeeType feeType = FEE_TYPE_MAPPING[_assetType];
        if (feeType == FeeType.Constant) {
            return minimumPaymentFee;
        } else if (feeType == FeeType.Percentage) {
            return percentageFee;
        }

        // default case - PercentageOrConstantMaximum
        if (percentageFee > minimumPaymentFee) return percentageFee; else return minimumPaymentFee;
    }


    /**
     * @notice Calculates payment fee
     * @param _value - payment value
     * @param _assetType - asset type, required as ERC20 & ERC721 only take minimal fee
     * @return fee - processing fee, few percent of slippage is allowed
     */
    function getPaymentFeePost(uint256 _value, AssetType _assetType) public view returns (uint256) {
        uint256 minimumPaymentFee = _getMinimumFee();
        uint256 percentageFee = _getPercentageFeePost(_value);
        FeeType feeType = FEE_TYPE_MAPPING[_assetType];
        if (feeType == FeeType.Constant) {
            return minimumPaymentFee;
        } else if (feeType == FeeType.Percentage) {
            return percentageFee;
        }

        // default case - PercentageOrConstantMaximum
        if (percentageFee > minimumPaymentFee) return percentageFee; else return minimumPaymentFee;
    }


    function _getMinimumFee() internal virtual view returns (uint256);

    // percentage fee is the same for both no oracle and oracle contracts
    function _getPercentageFee(uint256 _value) internal view returns (uint256) {
        return (_value * PAYMENT_FEE_PERCENTAGE) / PAYMENT_FEE_PERCENTAGE_DENOMINATOR;
    }

    // percentage fee post incoming transaction to get % from original amount
    function _getPercentageFeePost(uint256 _value) internal view returns (uint256) {
        return _value - (_value * PAYMENT_FEE_PERCENTAGE_DENOMINATOR / (PAYMENT_FEE_PERCENTAGE_DENOMINATOR + PAYMENT_FEE_PERCENTAGE))
    }

    function _getMinimumFeeOracle() internal view returns (uint256) {
        return (_dollarToWei() * MINIMAL_PAYMENT_FEE) / MINIMAL_PAYMENT_FEE_DENOMINATOR;
    }

    function _getMinimumFeeSimple() internal view returns (uint256) {
        return MINIMAL_PAYMENT_FEE;
    }

    /**
     * @notice Calculates value of a fee from sent msg.value
     * @param _valueToSplit - payment value, taken from msg.value
     * @param _assetType - asset type, as there may be different calculation logic for each type
     * @return fee - processing fee, few percent of slippage is allowed
     * @return value - payment value after substracting fee
     * ToDo: what happens in the case of ERC20, ERC721, ERC1155 => pass msg.value AND amount? what about batch calls?
     */
    function _splitPayment(uint256 _valueToSplit, AssetType _assetType) internal view returns (bool isFeeNative, uint256 fee, uint256 value) {
        uint256 minimalPaymentFee = _getMinimumFee();
        uint256 paymentFee = getPaymentFeePost(_valueToSplit, _assetType);
        isFeeNative = true;

        // we accept slippage of native coin price if fee type is not percentage - it this case we always get % no matter dollar price
        if (FEE_TYPE_MAPPING[_assetType] != FeeType.Percentage
            && _valueToSplit >= minimalPaymentFee * (100 - PAYMENT_FEE_SLIPPAGE_PERCENT) / 100
            && _valueToSplit <= minimalPaymentFee) {
            fee = _valueToSplit;
        } else {
            fee = paymentFee;
        }
        if (_valueToSplit < fee) {
            revert ValueSentTooSmall();
        }

        if (FEE_assetType === AssetType.SUPPORTED_ERC20) {
            isFeeNative = false;
        }
        if (FEE_TYPE_MAPPING[_assetType] === FeeType.Percentage {
            value = _valueToSplit - fee;
        } else {
            value = _valueToSplit;
        }
    }


    /**
    * @notice adjust payment fee percentage for native currency transfers
    * @dev Solidity is not good when it comes to handling floats. We use denominator then,
    *      e.g. to set payment fee to 1.5% , just pass paymentFee = 15 & denominator = 1000 => 15 / 1000 = 0.015 = 1.5%
    */
    function changePaymentFeePercentage (uint256 _paymentFeePercentage, uint256 _paymentFeeDenominator) external onlyOwner {
        if (_paymentFeePercentage <= 0) {
            revert PercentageFeeTooSmall();
        }
        if (_paymentFeeDenominator <= 0) {
            revert DenominatorTooSmall();
        }
        // can't go higher than 5% fee
        if (100*_paymentFeePercentage/_paymentFeeDenominator >= 5) {
            revert MinimalFeePercentageTooBig();
        }

        PAYMENT_FEE_PERCENTAGE = _paymentFeePercentage;
        PAYMENT_FEE_PERCENTAGE_DENOMINATOR = _paymentFeeDenominator;
    }

    /**
    * @notice adjust minimal payment fee for all asset transfers
    * @notice $ denominated values when using Chainlink
    * @notice wei denominated values when using simplified fee calculation
    * @dev Solidity is not good when it comes to handling floats. We use denominator then,
    *      e.g. to set minimal payment fee to 2.2$ , just pass paymentFee = 22 & denominator = 10 => 22 / 10 = 2.2
    */
    function changeMinimalPaymentFee (uint256 _minimalPaymentFee, uint256 _paymentFeeDenominator) external onlyOwner {
        if (_minimalPaymentFee <= 0) {
            revert PaymentFeeTooSmall();
        }
        if (_paymentFeeDenominator <= 0) {
            revert DenominatorTooSmall();
        }
        if (_minimalPaymentFee/_paymentFeeDenominator >= 5 || _minimalPaymentFee >= 5) {
            revert MinimalFeeTooBig();
        }

        MINIMAL_PAYMENT_FEE = _minimalPaymentFee;
        MINIMAL_PAYMENT_FEE_DENOMINATOR = _paymentFeeDenominator;
    }
}