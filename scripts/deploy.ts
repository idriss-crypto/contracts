import {Tipping} from "../src/types/src/contracts/Tipping";
import {ethers} from "hardhat";

// npx hardhat run --network <network> scripts/deploy.ts
// npx hardhat verify --network <network> <address> --constructor-args args.js

const provider = ethers.provider;
let tipping: Tipping;

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);
    const accountBalance = await provider.getBalance(deployer.address);

    console.log("Account balance: ", accountBalance.toString());

    if (process.env.DEPLOY_TIPPING == "true") {
        console.log("Deploying Tipping");
        const Tipping = await ethers.getContractFactory("Tipping");
        tipping = await Tipping.deploy(
            process.env.NATIVE_CURRENCY_ORACLE_ADDRESS!,
            process.env.NATIVE_CURRENCY_SEQUENCER_ADDRESS!,
            process.env.STALENESS_THRESHOLD!,
            process.env.FALLBACK_PRICE!,
            process.env.FALLBACK_PRICE_DECIMALS!,
            process.env.EAS_ADDRESS!,
            process.env.EAS_SCHEMA!
        );

        await tipping.waitForDeployment();

        console.log("deployed Tipping address:", await tipping.getAddress());
    }

    if (process.env.TRANFER_OWNERSHIP == "true") {
        console.log("Transferring ownership");
        const deployedTipping = (await ethers.getContractAt(
            "Tipping",
            process.env.TIPPING_ADDRESS!,
            deployer
        )) as Tipping;
        await deployedTipping
            .transferOwnership(process.env.NEW_OWNER!)
            .then((transaction) => {
                return transaction.wait();
            })
            .then((receipt) => {
                if (receipt && receipt.status !== 1) {
                    console.error("Transfering ownership failed");
                    console.error(JSON.stringify(receipt));
                } else {
                    console.log(
                        "Ownership transferred:",
                        JSON.stringify(receipt)
                    );
                }
            });
    }

    if (process.env.ADD_ADMIN == "true") {
        console.log("Adding Admin");
        const deployedTipping = (await ethers.getContractAt(
            "Tipping",
            process.env.TIPPING_ADDRESS!,
            deployer
        )) as Tipping;
        await deployedTipping
            .addAdmin(process.env.ADMIN_ADDRESS!)
            .then((transaction) => {
                return transaction.wait();
            })
            .then((receipt) => {
                if (receipt && receipt.status !== 1) {
                    console.error("Adding admin failed");
                    console.error(JSON.stringify(receipt));
                } else {
                    console.log("Admin added:", JSON.stringify(receipt));
                }
            });
    }

    if (process.env.ADD_SUPPORTED_ERC20 == "true") {
        console.log("Adding supported ERC20");
        const deployedTipping = (await ethers.getContractAt(
            "Tipping",
            process.env.TIPPING_ADDRESS!,
            deployer
        )) as Tipping;
        await deployedTipping
            .addSupportedERC20(process.env.SUPPORTED_ERC20!)
            .then((transaction) => {
                return transaction.wait();
            })
            .then((receipt) => {
                if (receipt && receipt.status !== 1) {
                    console.error("Adding supported ERC20 failed");
                    console.error(JSON.stringify(receipt));
                } else {
                    console.log("ERC20 added:", JSON.stringify(receipt));
                }
            });
    }
    console.log("DONE");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
