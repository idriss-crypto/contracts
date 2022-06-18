// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

//TODO: check how matic Oracle works
contract MaticPriceAggregatorV3Mock {
  function decimals() public view returns (uint8) {
     return 8;
  }

  function description() external view returns (string memory) {
     return "MATIC -> USD Mock";
  }

  function version() external view returns (uint256) {
     return 3;
  }

  // getRoundData and latestRoundData should both raise "No data present"
  // if they do not have data to report, instead of returning unset values
  // which could be misinterpreted as actual reported values.
  function getRoundData(uint80 _roundId)
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
          36662934,
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
          36662934,
          block.timestamp,
          block.timestamp,
          safeBlockNumber
       );
    }

   /*
   * @notice Get current amount of wei in a dollar
   * @dev ChainLink officially supports only USD -> MATIC,
   *      so we have to convert it back to get current amount of wei in a dollar
   */
   function dollarToWei() internal view returns (uint256) {
       (,int256 maticPrice,,,) = latestRoundData();
       if (maticPrice <= 0) {
           return 0;
       }

       uint256 maticPriceMultiplier = 10**decimals();
       return(10**18 * maticPriceMultiplier) / uint256(maticPrice);
    }
}