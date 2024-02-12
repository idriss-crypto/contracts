// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title NativePriceAggregatorV3Mock
 * @author Rafał Kalinowski
 * @notice mock NativePriceAggregatorV3
 * custom:experimental used only as a mock for tests
 */
contract NativePriceAggregatorV3Mock {
   int256 price = 230000000000;
   uint256 public stalenessTimeDelta = 1000;

  function decimals() public pure returns (uint8) {
     return 8;
  }

  function description() external pure returns (string memory) {
     return "Native -> USD Mock";
  }

  function version() external pure returns (uint256) {
     return 3;
  }

  // getRoundData and latestRoundData should both raise "No data present"
  // if they do not have data to report, instead of returning unset values
  // which could be misinterpreted as actual reported values.
  function getRoundData(uint80)
    external
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    ) {
       uint80 safeBlockNumber = uint80(block.number % type(uint80).max);
       return (
          safeBlockNumber,
          price,
          block.timestamp,
          block.timestamp,
          safeBlockNumber
       );
    }

  function latestRoundData()
    public
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    ) {
       uint80 safeBlockNumber = uint80(block.number % type(uint80).max);
       return (
          safeBlockNumber,
          price,
          block.timestamp,
          block.timestamp - stalenessTimeDelta,
          safeBlockNumber
       );
    }

   function setPrice(int256 _price) external {
      price = _price;
   }

   function setStalenessTimeDelta(uint256 _stalenessTimeDelta) external {
        stalenessTimeDelta = _stalenessTimeDelta;
    }


    function dollarToWei() external view returns (uint256) {
        (,int256 nativePrice,,,) = latestRoundData();
        require (nativePrice > 0, "Unable to retrieve NATIVE price.");

        uint256 nativePriceMultiplier = 10**decimals();

        return(10**18 * nativePriceMultiplier) / uint256(nativePrice);
    }
}