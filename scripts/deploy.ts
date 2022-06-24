import { SendToHash } from '../src/types/SendToHash'
import { ethers } from 'hardhat'

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance: ", (await deployer.getBalance()).toString());

  const SendToHash = await ethers.getContractFactory("SendToHash");
  const sendToHash = await SendToHash.deploy(
    process.env.IRDISS_REGISTRY_CONTRACT_ADDRESS!,
    process.env.MATIC_USD_PRICE_FEED_AGGREGATOR_CONTRACT_ADDRESS!
  );

  console.log("deployed SendToHash address:", sendToHash.address);

  //if you need to perform some action after deployment
  const deployedSendToHash = (await ethers.getContractAt("SendToHash", sendToHash.address, deployer)) as SendToHash;
  // await deployedSendToHash.transferOwnership(deployer.address)
  //   .then(transaction => {
  //     return transaction.wait(1)
  //   }
  //   )
  //   .then(receipt => {
  //     if (receipt.status !== 1) {
  //       console.error("Transfering ownership failed")
  //       console.error(JSON.stringify(receipt))
  //     }
  //   })

  console.log("DONE")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });