import {ethers, hardhatArguments} from "hardhat";

function getArgFileName(networkName: string): string {
    return `../args-${networkName.toLowerCase()}.js`;
  }

async function main() {

    const argFileName = getArgFileName(hardhatArguments.network!);

    let constructorArguments;
    try {
        constructorArguments = require(argFileName);
        console.log(hardhatArguments.network, constructorArguments)
    } catch (e) {
        console.error(`Failed to load constructor arguments from ${argFileName}:`, e);
        return;
    }

    const wrapper = await ethers.deployContract(
        "DonationWrapper",
        constructorArguments,
        {}
    );
    const DonationWrapperFactory = await ethers.getContractFactory("DonationWrapper");

     // Estimate the gas required for deployment
    const estimatedGas = await DonationWrapperFactory.getDeployTransaction(...constructorArguments).estimateGas();
    console.log(`Estimated gas for deployment: ${estimatedGas}`);

    await wrapper.waitForDeployment();

    console.log(`Deployed at ${await wrapper.getAddress()}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
