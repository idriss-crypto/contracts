import { SendToHash } from '../src/types/SendToHash'
import { Tipping } from '../src/types/Tipping'
import { ethers } from 'hardhat'

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance: ", (await deployer.getBalance()).toString());

  if (process.env.DEPLOY_SEND_TO_ANYONE == 'true') {
    console.log("Deploying SendToAnyone")
    const SendToHash = await ethers.getContractFactory("SendToHash");
    const sendToHash = await SendToHash.deploy(
        process.env.IRDISS_REGISTRY_CONTRACT_ADDRESS!,
        process.env.MATIC_USD_PRICE_FEED_AGGREGATOR_CONTRACT_ADDRESS!
    );

    await sendToHash.deployed()

    console.log("deployed SendToHash address:", sendToHash.address);
  }

  if (process.env.DEPLOY_TIPPING == 'true') {
    console.log("Deploying Tipping")
    const Tipping = await ethers.getContractFactory("Tipping");
    const tipping = await Tipping.deploy(
        process.env.MATIC_USD_PRICE_FEED_AGGREGATOR_CONTRACT_ADDRESS!
    );

    await tipping.deployed()

    console.log("deployed Tipping address:", tipping.address);
  }

  //if you need to perform some action after deployment
  // const deployedSendToHash = (await ethers.getContractAt("SendToHash", sendToHash.address, deployer)) as SendToHash;
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