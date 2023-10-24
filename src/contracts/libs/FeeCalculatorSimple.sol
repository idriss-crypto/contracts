// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import { AssetType, FeeType } from "../enums/IDrissEnums.sol";

/**
 * @title FeeCalculator
 * @author Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @custom:contributor Lennard (levertz)
 * @notice This is an utility contract for calculating a fee
 * @notice In this simlified version, we don't use (chainlink) oracles, but a constant (adjustable) fee
 */
contract FeeCalculator is Ownable {
    uint256 public constant PAYMENT_FEE_SLIPPAGE_PERCENT = 5;
    uint256 public PAYMENT_FEE_PERCENTAGE = 10;
    uint256 public PAYMENT_FEE_PERCENTAGE_DENOMINATOR = 1000;
    uint256 public MINIMAL_PAYMENT_FEE = 500000000000000;
    // you have to pass your desired fee types in a constructor deriving this contract
    mapping (AssetType => FeeType) FEE_TYPE_MAPPING;

    constructor() {
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

    function _getMinimumFee() internal view returns (uint256) {
        return MINIMAL_PAYMENT_FEE;
    }

    function _getPercentageFee(uint256 _value) internal view returns (uint256) {
        return (_value * PAYMENT_FEE_PERCENTAGE) / PAYMENT_FEE_PERCENTAGE_DENOMINATOR;
    }

    /**
     * @notice Calculates value of a fee from sent msg.value
     * @param _valueToSplit - payment value, taken from msg.value
     * @param _assetType - asset type, as there may be different calculation logic for each type
     * @return fee - processing fee, few percent of slippage is allowed
     * @return value - payment value after substracting fee
     */
    function _splitPayment(uint256 _valueToSplit, AssetType _assetType) internal view returns (uint256 fee, uint256 value) {
        uint256 minimalPaymentFee = _getMinimumFee();
        uint256 paymentFee = getPaymentFee(_valueToSplit, _assetType);

        // we accept slippage of native coin price if fee type is not percentage - it this case we always get % no matter dollar price
        if (FEE_TYPE_MAPPING[_assetType] != FeeType.Percentage
            && _valueToSplit >= minimalPaymentFee * (100 - PAYMENT_FEE_SLIPPAGE_PERCENT) / 100
            && _valueToSplit <= minimalPaymentFee) {
            fee = _valueToSplit;
        } else {
            fee = paymentFee;
        }

        require (_valueToSplit >= fee, "Value sent is smaller than minimal fee.");

        value = _valueToSplit - fee;
    }


    /**
    * @notice adjust payment fee percentage for big native currency transfers
    * @dev Solidity is not good when it comes to handling floats. We use denominator then,
    *      e.g. to set payment fee to 1.5% , just pass paymentFee = 15 & denominator = 1000 => 15 / 1000 = 0.015 = 1.5%
    */
    function changePaymentFeePercentage (uint256 _paymentFeePercentage, uint256 _paymentFeeDenominator) external onlyOwner {
        require(_paymentFeePercentage > 0, "Payment fee has to be bigger than 0");
        require(_paymentFeeDenominator > 0, "Payment fee denominator has to be bigger than 0");

        PAYMENT_FEE_PERCENTAGE = _paymentFeePercentage;
        PAYMENT_FEE_PERCENTAGE_DENOMINATOR = _paymentFeeDenominator;
    }

    /**
    * @notice adjust minimal payment fee for all asset transfers
    */
    function changeMinimalPaymentFee (uint256 _minimalPaymentFee) external onlyOwner {
        require(_minimalPaymentFee > 0, "Payment fee has to be bigger than 0");
        MINIMAL_PAYMENT_FEE = _minimalPaymentFee;
    }
}