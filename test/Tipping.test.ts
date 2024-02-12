import {expect, use} from "chai";
import {ethers} from "hardhat";
import {Signer, Interface, BytesLike} from "ethers";

import {
    ExtendedTipping,
    ExtendedMockNFT,
    ExtendedMockToken,
    ExtendedNativePriceAggregatorV3Mock,
    ExtendedNativePriceAggregatorV3SequencerMock,
    ExtendedMockEAS,
    ExtendedMockERC1155,
} from "../src/contracts/extendContracts";

import {MockAttacker} from "../src/types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NFT_ID_ARRAY = [...Array(12).keys()];
const ERC1155_ARRAY = [
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 60],
    [4, 1_000_000],
    [5, 996],
];

const AssetType = {
    Native: 0,
    ERC20: 1,
    ERC721: 2,
    ERC1155: 3,
    SUPPORTED_ERC20: 4,
};

describe("Tipping Contract", function () {
    let provider = ethers.provider;
    let owner: Signer;
    let signer1: Signer;
    let signer2: Signer;
    let ownerAddress: string;
    let signer1Address: string;
    let signer2Address: string;
    let mockToken: ExtendedMockToken;
    let mockToken2: ExtendedMockToken;
    let mockNFT: ExtendedMockNFT;
    let mockERC1155: ExtendedMockERC1155;
    let mockPriceOracle: ExtendedNativePriceAggregatorV3Mock;
    let mockPriceSequencer: ExtendedNativePriceAggregatorV3SequencerMock;
    let mockEAS: ExtendedMockEAS;
    let mockAttacker: MockAttacker;
    let tippingContract: ExtendedTipping;
    let tippingContract_noEAS: ExtendedTipping;
    let tippingContract_noOracle: ExtendedTipping;
    let tippingContract_noEAS_noOracle: ExtendedTipping;
    let dollarInWei: bigint;
    let dollarInWeiFallback: bigint;
    let PAYMENT_FEE_PERCENTAGE: bigint;
    let PAYMENT_FEE_PERCENTAGE_DENOMINATOR: bigint;
    let NATIVE_WEI_MULTIPLIER: bigint;
    let FALLBACK_DECIMALS: bigint;
    let FALLBACK_PRICE: bigint;
    let schema: BytesLike;

    const setupToken = async () => {
        // Get the ContractFactory for your MockToken
        const MockToken = await ethers.getContractFactory("MockToken");
        mockToken = (await MockToken.deploy()) as ExtendedMockToken;
        const MockToken2 = await ethers.getContractFactory("MockToken");
        mockToken2 = (await MockToken2.deploy()) as ExtendedMockToken;
        await mockToken.waitForDeployment();
        await mockToken2.waitForDeployment();
    };
    const setupERC721 = async () => {
        const MockNFT = await ethers.getContractFactory("MockNFT");

        mockNFT = (await MockNFT.deploy()) as ExtendedMockNFT;
        await mockNFT.waitForDeployment();

        await Promise.all(
            NFT_ID_ARRAY.map(async (val) => {
                return await mockNFT
                    .safeMint(ownerAddress, val)
                    .catch(() => {});
            })
        );
    };
    const setupERC1155 = async () => {
        const MockERC1155 = await ethers.getContractFactory("MockERC1155");

        mockERC1155 = (await MockERC1155.deploy()) as ExtendedMockERC1155;
        await mockERC1155.waitForDeployment();

        await Promise.all(
            ERC1155_ARRAY.map(async (val) => {
                return await mockERC1155
                    .mint(ownerAddress, val[0], val[1])
                    .catch(() => {});
            })
        );
    };

    before(async () => {
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        signer1 = accounts[1];
        signer2 = accounts[2];
        ownerAddress = await owner.getAddress();
        signer1Address = await signer1.getAddress();
        signer2Address = await signer2.getAddress();
        schema =
            "0x28b73429cc730191053ba7fe21e17253be25dbab480f0c3a369de5217657d925";

        FALLBACK_PRICE = BigInt("200000000000");
        FALLBACK_DECIMALS = BigInt("8");
        NATIVE_WEI_MULTIPLIER = BigInt("10") ** BigInt("18");

        const NativePriceAggregatorV3MockFactory =
            await ethers.getContractFactory("NativePriceAggregatorV3Mock");
        mockPriceOracle =
            (await NativePriceAggregatorV3MockFactory.deploy()) as ExtendedNativePriceAggregatorV3Mock;
        await mockPriceOracle.waitForDeployment();

        mockPriceOracle.address = await mockPriceOracle.getAddress();

        const NativePriceAggregatorV3SequencerMockFactory =
            await ethers.getContractFactory(
                "NativePriceAggregatorV3SequencerMock"
            );
        mockPriceSequencer =
            (await NativePriceAggregatorV3SequencerMockFactory.deploy()) as ExtendedNativePriceAggregatorV3SequencerMock;
        await mockPriceSequencer.waitForDeployment();

        mockPriceSequencer.address = await mockPriceSequencer.getAddress();

        const MockEASFactory = await ethers.getContractFactory("MockEAS");
        mockEAS = (await MockEASFactory.deploy()) as ExtendedMockEAS;
        await mockEAS.waitForDeployment();

        mockEAS.address = await mockEAS.getAddress();

        const TippingFactory = await ethers.getContractFactory("Tipping");
        tippingContract = (await TippingFactory.deploy(
            mockPriceOracle.address,
            mockPriceSequencer.address,
            3600,
            FALLBACK_PRICE,
            FALLBACK_DECIMALS,
            mockEAS.address,
            schema
        )) as ExtendedTipping;
        await tippingContract.waitForDeployment();

        tippingContract.address = await tippingContract.getAddress();

        tippingContract_noEAS = (await TippingFactory.deploy(
            mockPriceOracle.address,
            mockPriceSequencer.address,
            3600,
            FALLBACK_PRICE,
            FALLBACK_DECIMALS,
            ZERO_ADDRESS,
            schema
        )) as ExtendedTipping;
        await tippingContract_noEAS.waitForDeployment();

        tippingContract_noEAS.address =
            await tippingContract_noEAS.getAddress();

        tippingContract_noOracle = (await TippingFactory.deploy(
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            0,
            FALLBACK_PRICE,
            FALLBACK_DECIMALS,
            mockEAS.address,
            schema
        )) as ExtendedTipping;
        await tippingContract_noOracle.waitForDeployment();

        tippingContract_noOracle.address =
            await tippingContract_noOracle.getAddress();

        tippingContract_noEAS_noOracle = (await TippingFactory.deploy(
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            0,
            FALLBACK_PRICE,
            FALLBACK_DECIMALS,
            ZERO_ADDRESS,
            schema
        )) as ExtendedTipping;
        await tippingContract_noEAS_noOracle.waitForDeployment();

        tippingContract_noEAS_noOracle.address =
            await tippingContract_noEAS_noOracle.getAddress();

        dollarInWei = (await mockPriceOracle.dollarToWei()) / BigInt("10");
        dollarInWeiFallback =
            (NATIVE_WEI_MULTIPLIER * BigInt("10") ** FALLBACK_DECIMALS) /
            (FALLBACK_PRICE * BigInt("10"));
        PAYMENT_FEE_PERCENTAGE = BigInt("10");
        PAYMENT_FEE_PERCENTAGE_DENOMINATOR = BigInt("1000");

        await Promise.all([setupToken(), setupERC721(), setupERC1155()]);
        mockToken.address = await mockToken.getAddress();
        mockToken2.address = await mockToken2.getAddress();
        mockNFT.address = await mockNFT.getAddress();
        mockERC1155.address = await mockERC1155.getAddress();

        const AttackerFactory = await ethers.getContractFactory("MockAttacker");
        mockAttacker = (await AttackerFactory.deploy(
            tippingContract.address
        )) as MockAttacker;
        await mockAttacker.waitForDeployment();
    });

    describe("Contract management", async () => {
        it("properly adds admin", async () => {
            expect(await tippingContract.admins(ownerAddress)).to.be.true;
            expect(await tippingContract.admins(signer1Address)).to.be.false;
            expect(await tippingContract.admins(signer2Address)).to.be.false;

            await tippingContract.addAdmin(signer1Address);
            await tippingContract.addAdmin(signer2Address);

            expect(await tippingContract.admins(ownerAddress)).to.be.true;
            expect(await tippingContract.admins(signer1Address)).to.be.true;
            expect(await tippingContract.admins(signer2Address)).to.be.true;
        });

        it("properly removes admin", async () => {
            await tippingContract.addAdmin(signer1Address);
            await tippingContract.addAdmin(signer2Address);

            expect(await tippingContract.admins(signer1Address)).to.be.true;
            expect(await tippingContract.admins(signer2Address)).to.be.true;

            await tippingContract.deleteAdmin(signer1Address);
            await tippingContract.deleteAdmin(signer2Address);

            expect(await tippingContract.admins(signer1Address)).to.be.false;
            expect(await tippingContract.admins(signer2Address)).to.be.false;
        });

        it("properly adds and deletes supported ERC20", async () => {
            expect(await tippingContract.supportedERC20(mockToken2.address)).to
                .be.false;

            await tippingContract.addSupportedERC20(mockToken2.address);

            expect(await tippingContract.supportedERC20(mockToken2.address)).to
                .be.true;

            await tippingContract.deleteSupportedERC20(mockToken2.address);

            expect(await tippingContract.supportedERC20(mockToken2.address)).to
                .be.false;
        });

        it("properly adds and deletes public good address", async () => {
            expect(await tippingContract.publicGoods(signer1Address)).to.be
                .false;

            await tippingContract.addPublicGood(signer1Address);

            expect(await tippingContract.publicGoods(signer1Address)).to.be
                .true;

            await tippingContract.deletePublicGood(signer1Address);

            expect(await tippingContract.publicGoods(signer1Address)).to.be
                .false;
        });

        it("properly adds and deletes EAS support", async () => {
            expect(await tippingContract_noEAS.SUPPORTS_EAS()).to.be.false;

            await tippingContract_noEAS.enableEASSupport(
                mockEAS.address,
                schema
            );

            expect(await tippingContract_noEAS.SUPPORTS_EAS()).to.be.true;

            await tippingContract_noEAS.disableEASSupport();

            expect(await tippingContract_noEAS.SUPPORTS_EAS()).to.be.false;
        });

        it("properly adds and deletes Chainlink support", async () => {
            expect(await tippingContract_noOracle.SUPPORTS_CHAINLINK()).to.be
                .false;

            await tippingContract_noOracle.enableChainlinkSupport(
                mockPriceOracle.address,
                ZERO_ADDRESS,
                0
            );

            expect(await tippingContract_noOracle.SUPPORTS_CHAINLINK()).to.be
                .true;
            expect(await tippingContract_noOracle.CHECK_SEQUENCER()).to.be
                .false;

            await tippingContract_noOracle.disableChainlinkSupport();

            expect(await tippingContract_noOracle.SUPPORTS_CHAINLINK()).to.be
                .false;
        });

        it("allows anyone to call the withdraw function", async () => {
            expect(await tippingContract.admins(ownerAddress)).to.be.true;
            expect(await tippingContract.admins(signer1Address)).to.be.false;

            await mockToken
                .connect(owner)
                .transfer(tippingContract.address, BigInt("1000"));

            const ownerTokenBalanceBefore = await mockToken.balanceOf(
                ownerAddress
            );

            await expect(tippingContract.connect(signer1).withdraw()).to.not.be
                .rejected;
            await expect(
                tippingContract
                    .connect(signer1)
                    .withdrawToken(mockToken.address)
            ).to.not.be.rejected;
            await expect(tippingContract.withdraw()).to.not.be.rejected;

            const ownerTokenBalanceAfter = await mockToken.balanceOf(
                ownerAddress
            );
            const signer1TokenBalanceAfter = await mockToken.balanceOf(
                signer1Address
            );

            expect(ownerTokenBalanceAfter).to.equal(
                ownerTokenBalanceBefore + BigInt("1000")
            );
            expect(signer1TokenBalanceAfter).to.equal(signer1TokenBalanceAfter);
        });

        it("allows to change minimal payment fee", async () => {
            const calculatedFeeBefore = await tippingContract.getPaymentFee(
                1000000,
                AssetType.ERC20,
                signer1Address
            );
            expect(calculatedFeeBefore).to.equal(dollarInWei);
            // double minimal payment fee
            await tippingContract.changeMinimalPaymentFee(2, 10);
            const calculatedFeeAfter = await tippingContract.getPaymentFee(
                1000000,
                AssetType.ERC20,
                signer1Address
            );
            expect(calculatedFeeAfter).to.equal(dollarInWei * BigInt("2"));
            // return fee to initial amount
            await tippingContract.changeMinimalPaymentFee(1, 10);
            const calculatedFeeAfter2 = await tippingContract.getPaymentFee(
                1000000,
                AssetType.ERC20,
                signer1Address
            );
            expect(calculatedFeeAfter2).to.equal(dollarInWei);
        });

        it("allows to change minimal payment fee percentage", async () => {
            const weiToSend = BigInt("1000000");
            const expectedCalculatedFeeBefore =
                (weiToSend * PAYMENT_FEE_PERCENTAGE) /
                PAYMENT_FEE_PERCENTAGE_DENOMINATOR;

            const calculatedFeeBefore = await tippingContract.getPaymentFee(
                weiToSend,
                AssetType.Native,
                signer1Address
            );
            expect(calculatedFeeBefore).to.equal(expectedCalculatedFeeBefore);

            // increase minimal payment fee to close to 5%
            await tippingContract.changePaymentFeePercentage(49, 1000);
            const expectedCalculatedFeeAfter =
                (weiToSend * BigInt("49")) / BigInt("1000");
            const calculatedFeeAfter = await tippingContract.getPaymentFee(
                weiToSend,
                AssetType.Native,
                signer1Address
            );
            expect(calculatedFeeAfter).to.equal(expectedCalculatedFeeAfter);

            // return fee to initial amount
            await tippingContract.changePaymentFeePercentage(10, 1000);
            const calculatedFeeAfter2 = await tippingContract.getPaymentFee(
                weiToSend,
                AssetType.Native,
                signer1Address
            );
            expect(calculatedFeeAfter2).to.equal(expectedCalculatedFeeBefore);
        });

        it("allows only owner to change owner", async () => {
            await expect(
                tippingContract
                    .connect(signer1)
                    .transferOwnership(signer1Address)
            ).to.be.revertedWith("Ownable: caller is not the owner");

            await expect(tippingContract.transferOwnership(signer1Address)).to
                .not.be.reverted;

            await tippingContract
                .connect(signer1)
                .transferOwnership(ownerAddress);
        });

        it("allows only owner to change admin roles", async () => {
            await expect(
                tippingContract.connect(signer1).addAdmin(signer2Address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(
                tippingContract.connect(signer1).deleteAdmin(signer2Address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("allows only owner to change minimal payment fee", async () => {
            await expect(
                tippingContract.connect(signer1).changeMinimalPaymentFee(2, 1)
            ).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(
                tippingContract
                    .connect(signer1)
                    .changePaymentFeePercentage(49, 1000)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("triggers onlyAdmin modifier when trying to call an admin function as non admin", async () => {
            await expect(
                tippingContract.connect(signer1).addPublicGood(signer2Address)
            ).to.be.revertedWithCustomError(tippingContract, "OnlyAdminMethod");
            await expect(
                tippingContract
                    .connect(signer1)
                    .deletePublicGood(signer2Address)
            ).to.be.revertedWithCustomError(tippingContract, "OnlyAdminMethod");
            await expect(
                tippingContract
                    .connect(signer1)
                    .addSupportedERC20(mockToken.address)
            ).to.be.revertedWithCustomError(tippingContract, "OnlyAdminMethod");
            await expect(
                tippingContract
                    .connect(signer1)
                    .deleteSupportedERC20(mockToken.address)
            ).to.be.revertedWithCustomError(tippingContract, "OnlyAdminMethod");
        });

        it("triggers onlyOwner modifier when trying to call owner function as non owner", async () => {
            await expect(
                tippingContract.renounceOwnership()
            ).to.be.revertedWithCustomError(
                tippingContract,
                "RenounceOwnershipNotAllowed"
            );
            await expect(
                tippingContract.connect(signer1).renounceOwnership()
            ).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(
                tippingContract
                    .connect(signer1)
                    .enableEASSupport(mockEAS.address, schema)
            ).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(
                tippingContract.connect(signer1).disableEASSupport()
            ).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(
                tippingContract
                    .connect(signer1)
                    .enableChainlinkSupport(
                        mockPriceOracle.address,
                        mockPriceSequencer.address,
                        3600
                    )
            ).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(
                tippingContract.connect(signer1).disableChainlinkSupport()
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    // describe("Send native currency", () => {
    //     it("correctly calculates percentage fee", async () => {
    //         // Fee is on top in the new design:
    //         // protocol forwards x. Here x+1% = weiToSend

    //         for (let contract of [
    //             tippingContract,
    //             tippingContract_noOracle,
    //             tippingContract_noEAS,
    //             tippingContract_noEAS_noOracle,
    //         ]) {
    //             const weiToSend = BigInt("1000000");
    //             const expectedProtocolFee =
    //                 (weiToSend * PAYMENT_FEE_PERCENTAGE) /
    //                 PAYMENT_FEE_PERCENTAGE_DENOMINATOR;
    //             const calculatedFee = await contract.getPaymentFee(
    //                 weiToSend,
    //                 AssetType.Native,
    //                 signer1Address
    //             );
    //             expect(calculatedFee).to.equal(expectedProtocolFee);

    //             await contract.addPublicGood(signer2Address);
    //             const calculatedFeePG = await contract.getPaymentFee(
    //                 weiToSend,
    //                 AssetType.Native,
    //                 signer2Address
    //             );
    //             expect(calculatedFeePG.toString()).to.equal("0");
    //             await contract.deletePublicGood(signer2Address);
    //         }
    //     });

    //     it("allows for sending native currency", async () => {
    //         const weiToReceive = BigInt("1000000");
    //         const calculatedFee = await tippingContract.getPaymentFee(
    //             weiToReceive,
    //             AssetType.Native,
    //             signer1Address
    //         );
    //         const weiToSend = weiToReceive + calculatedFee;

    //         const tippingContractBalanceBefore = await provider.getBalance(
    //             tippingContract.address
    //         );
    //         const signer1BalanceBefore = await provider.getBalance(
    //             signer1Address
    //         );

    //         await tippingContract.sendNativeTo(signer1Address, "", {
    //             value: weiToSend,
    //         });
    //         const tippingContractBalanceAfter = await provider.getBalance(
    //             tippingContract.address
    //         );
    //         const signer1BalanceAfter = await provider.getBalance(
    //             signer1Address
    //         );
    //         expect(tippingContractBalanceAfter).to.equal(
    //             tippingContractBalanceBefore + calculatedFee
    //         );
    //         expect(signer1BalanceAfter).to.equal(
    //             signer1BalanceBefore + weiToReceive
    //         );

    //         // Do not take a fee if the recipient is a public good, and add attestation
    //         await tippingContract.addPublicGood(signer2Address);
    //         const signer2BalanceBefore = await provider.getBalance(
    //             signer2Address
    //         );
    //         await tippingContract.sendNativeTo(signer2Address, "", {
    //             value: weiToReceive,
    //         });
    //         const tippingContractBalanceAfter2 = await provider.getBalance(
    //             tippingContract.address
    //         );
    //         const signer2BalanceAfter = await provider.getBalance(
    //             signer2Address
    //         );
    //         expect(tippingContractBalanceAfter2).to.equal(
    //             tippingContractBalanceAfter
    //         );
    //         expect(signer2BalanceAfter).to.equal(
    //             signer2BalanceBefore + weiToReceive
    //         );
    //         await tippingContract.deletePublicGood(signer2Address);
    //     });

    //     it("allows sending asset to other (non-publicGood) address as batch", async () => {
    //         const weiToReceive1 = BigInt("1000000");
    //         const weiToReceive2 = BigInt("2500000");
    //         const tippingContractBalanceBefore = await provider.getBalance(
    //             tippingContract.address
    //         );
    //         const sig1BalanceBefore = await provider.getBalance(signer1Address);
    //         const sig2BalanceBefore = await provider.getBalance(signer2Address);

    //         const batchObject1 = {
    //             assetType: AssetType.Native,
    //             recipient: signer1Address,
    //             amount: weiToReceive1,
    //             tokenId: 0,
    //             tokenAddress: ZERO_ADDRESS,
    //             message: "",
    //         };
    //         const batchObject2 = {
    //             assetType: AssetType.Native,
    //             recipient: signer2Address,
    //             amount: weiToReceive2,
    //             tokenId: 0,
    //             tokenAddress: ZERO_ADDRESS,
    //             message: "",
    //         };

    //         const batchSendObject = await tippingContract.calculateBatchFee([
    //             batchObject1,
    //             batchObject2,
    //         ]);
    //         let nativeAmountToSend = BigInt(0);
    //         let adjustedBatchSendObject = batchSendObject.map((call) => {
    //             nativeAmountToSend += BigInt(call.nativeAmount);
    //             return {
    //                 assetType: call.assetType,
    //                 recipient: call.recipient,
    //                 amount: call.amount,
    //                 tokenId: call.tokenId,
    //                 tokenAddress: call.tokenAddress,
    //                 message: call.message,
    //             };
    //         });

    //         await tippingContract.batchSendTo(adjustedBatchSendObject, {
    //             value: nativeAmountToSend,
    //         });

    //         const tippingContractBalanceAfter = await provider.getBalance(
    //             tippingContract.address
    //         );
    //         const sig1BalanceAfter = await provider.getBalance(signer1Address);
    //         const sig2BalanceAfter = await provider.getBalance(signer2Address);

    //         expect(tippingContractBalanceAfter).to.equal(
    //             tippingContractBalanceBefore +
    //                 nativeAmountToSend -
    //                 weiToReceive1 -
    //                 weiToReceive2
    //         );
    //         expect(sig1BalanceAfter).to.equal(
    //             sig1BalanceBefore + weiToReceive1
    //         );
    //         expect(sig2BalanceAfter).to.equal(
    //             sig2BalanceBefore + weiToReceive2
    //         );
    //     });

    //     it("allows sending asset to other (non-publicGood and publicGoods) address as batch", async () => {
    //         const weiToReceive1 = BigInt("1000000");
    //         const weiToReceive2 = BigInt("2500000");
    //         const tippingContractBalanceBefore = await provider.getBalance(
    //             tippingContract.address
    //         );
    //         const sig1BalanceBefore = await provider.getBalance(signer1Address);
    //         const sig2BalanceBefore = await provider.getBalance(signer2Address);
    //         await tippingContract.addPublicGood(signer2Address);

    //         const batchObject1 = {
    //             assetType: AssetType.Native,
    //             recipient: signer1Address,
    //             amount: weiToReceive1,
    //             tokenId: 0,
    //             tokenAddress: ZERO_ADDRESS,
    //             message: "",
    //         };
    //         const batchObject2 = {
    //             assetType: AssetType.Native,
    //             recipient: signer2Address,
    //             amount: weiToReceive2,
    //             tokenId: 0,
    //             tokenAddress: ZERO_ADDRESS,
    //             message: "",
    //         };

    //         const batchSendObject = await tippingContract.calculateBatchFee([
    //             batchObject1,
    //             batchObject2,
    //         ]);
    //         let nativeAmountToSend = BigInt(0);
    //         let adjustedBatchSendObject = batchSendObject.map((call) => {
    //             nativeAmountToSend += BigInt(call.nativeAmount);
    //             return {
    //                 assetType: call.assetType,
    //                 recipient: call.recipient,
    //                 amount: call.amount,
    //                 tokenId: call.tokenId,
    //                 tokenAddress: call.tokenAddress,
    //                 message: call.message,
    //             };
    //         });

    //         await tippingContract.batchSendTo(adjustedBatchSendObject, {
    //             value: nativeAmountToSend,
    //         });

    //         const tippingContractBalanceAfter = await provider.getBalance(
    //             tippingContract.address
    //         );
    //         const sig1BalanceAfter = await provider.getBalance(signer1Address);
    //         const sig2BalanceAfter = await provider.getBalance(signer2Address);

    //         expect(batchSendObject[1].amount).to.equal(weiToReceive2);
    //         expect(tippingContractBalanceAfter).to.equal(
    //             tippingContractBalanceBefore +
    //                 nativeAmountToSend -
    //                 weiToReceive1 -
    //                 weiToReceive2
    //         );
    //         expect(sig1BalanceAfter).to.equal(
    //             sig1BalanceBefore + weiToReceive1
    //         );
    //         expect(sig2BalanceAfter).to.equal(
    //             sig2BalanceBefore + weiToReceive2
    //         );

    //         await tippingContract.deletePublicGood(signer2Address);
    //     });

    //     it("emits a TipMessage event", async () => {
    //         const weiToReceive = BigInt("1000000");
    //         const calculatedFee = await tippingContract.getPaymentFee(
    //             weiToReceive,
    //             AssetType.Native,
    //             signer1Address
    //         );
    //         const weiToSend = weiToReceive + calculatedFee;
    //         await expect(
    //             tippingContract.sendNativeTo(signer1Address, "xyz", {
    //                 value: weiToSend,
    //             })
    //         )
    //             .to.emit(tippingContract, "TipMessage")
    //             .withArgs(
    //                 signer1Address,
    //                 "xyz",
    //                 ownerAddress,
    //                 AssetType.Native,
    //                 ZERO_ADDRESS,
    //                 0,
    //                 weiToReceive,
    //                 calculatedFee
    //             );
    //     });

    //     it("Correctly emits an Attested event", async () => {
    //         await tippingContract.addPublicGood(signer1Address);

    //         const weiToSend = BigInt("1000000");

    //         await expect(
    //             tippingContract.sendNativeTo(signer1Address, "", {
    //                 value: weiToSend,
    //             })
    //         )
    //             .to.emit(mockEAS, "Attested")
    //             .withArgs(ownerAddress, tippingContract.address, schema);

    //         await expect(
    //             tippingContract_noEAS.sendNativeTo(signer1Address, "", {
    //                 value: weiToSend,
    //             })
    //         ).to.not.emit(mockEAS, "Attested");

    //         await tippingContract.disableEASSupport();

    //         await expect(
    //             tippingContract.sendNativeTo(signer1Address, "", {
    //                 value: weiToSend,
    //             })
    //         ).to.not.emit(mockEAS, "Attested");

    //         await tippingContract.enableEASSupport(mockEAS.address, schema);

    //         await tippingContract.deletePublicGood(signer1Address);
    //     });
    // });

    describe("Send ERC20", () => {
        it("properly calculates fee when sending asset", async () => {
            await tippingContract.addSupportedERC20(mockToken2.address);
            await tippingContract_noOracle.addSupportedERC20(
                mockToken2.address
            );
            await tippingContract_noEAS_noOracle.addSupportedERC20(
                mockToken2.address
            );
            await tippingContract.addPublicGood(signer2Address);
            await tippingContract_noOracle.addPublicGood(signer2Address);
            await tippingContract_noEAS_noOracle.addPublicGood(signer2Address);

            const tokenToSend = BigInt("1000000");
            // Fee in token balance, same for chainlink and no chainlink support
            const expectedProtocolFeeNonPGSupported =
                (tokenToSend * PAYMENT_FEE_PERCENTAGE) /
                PAYMENT_FEE_PERCENTAGE_DENOMINATOR;
            const calculatedFeeNonPGSupported =
                await tippingContract.getPaymentFee(
                    tokenToSend,
                    AssetType.SUPPORTED_ERC20,
                    signer1Address
                );

            // Fee in native
            const expectedProtocolFeeNonPGNonSupported = dollarInWei;
            const calculatedFeeNonPGNonSupported =
                await tippingContract.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC20,
                    signer1Address
                );
            const expectedProtocolFeeNonPGNonSupported_noOracle =
                dollarInWeiFallback;
            const calculatedFeeNonPGNonSupported_noOracle =
                await tippingContract_noOracle.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC20,
                    signer1Address
                );
            const expectedProtocolFeeNonPGNonSupported_noEAS_noOracle =
                dollarInWeiFallback;
            const calculatedFeeNonPGNonSupported_noEAS_noOracle =
                await tippingContract_noEAS_noOracle.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC20,
                    signer1Address
                );
            expect(calculatedFeeNonPGSupported).to.equal(
                expectedProtocolFeeNonPGSupported
            );
            expect(calculatedFeeNonPGNonSupported).to.equal(
                expectedProtocolFeeNonPGNonSupported
            );
            expect(calculatedFeeNonPGNonSupported_noOracle).to.equal(
                expectedProtocolFeeNonPGNonSupported_noOracle
            );
            expect(calculatedFeeNonPGNonSupported_noEAS_noOracle).to.equal(
                expectedProtocolFeeNonPGNonSupported_noEAS_noOracle
            );

            const expectedProtocolFeePG = 0;
            const calculatedFeePGSupported =
                await tippingContract.getPaymentFee(
                    tokenToSend,
                    AssetType.SUPPORTED_ERC20,
                    signer2Address
                );
            const calculatedFeePGNonSupported =
                await tippingContract.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC20,
                    signer2Address
                );
            const calculatedFeePGNonSupported_noOracle =
                await tippingContract_noOracle.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC20,
                    signer2Address
                );
            const calculatedFeePGNonSupported_noEAS_noOracle =
                await tippingContract_noEAS_noOracle.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC20,
                    signer2Address
                );
            expect(calculatedFeePGSupported).to.equal(expectedProtocolFeePG);
            expect(calculatedFeePGNonSupported).to.equal(expectedProtocolFeePG);
            expect(calculatedFeePGNonSupported_noOracle).to.equal(
                expectedProtocolFeePG
            );
            expect(calculatedFeePGNonSupported_noEAS_noOracle).to.equal(
                expectedProtocolFeePG
            );

            await tippingContract.deleteSupportedERC20(mockToken2.address);
            await tippingContract_noOracle.deleteSupportedERC20(
                mockToken2.address
            );
            await tippingContract_noEAS_noOracle.deleteSupportedERC20(
                mockToken2.address
            );
            await tippingContract.deletePublicGood(signer2Address);
            await tippingContract_noOracle.deletePublicGood(signer2Address);
            await tippingContract_noEAS_noOracle.deletePublicGood(
                signer2Address
            );
        });

        it("allows for sending unsupported ERC20 asset to other address", async () => {
            await tippingContract.addPublicGood(signer2Address);
            const tokensToSend = BigInt("1000000");
            const calculatedFeeNPG = await tippingContract.getPaymentFee(
                tokensToSend,
                AssetType.ERC20,
                signer1Address
            );
            // Confirmed to equal 0
            const calculatedFeePG = await tippingContract.getPaymentFee(
                tokensToSend,
                AssetType.ERC20,
                signer2Address
            );

            const sig1BalanceBefore = await mockToken.balanceOf(signer1Address);
            const sig2BalanceBefore = await mockToken.balanceOf(signer2Address);
            const tippingContractTokenBalanceBefore = await mockToken.balanceOf(
                tippingContract.address
            );
            const tippingContractNativeBalanceBefore =
                await provider.getBalance(tippingContract.address);

            await mockToken.increaseAllowance(
                tippingContract.address,
                tokensToSend
            );
            await tippingContract.sendERC20To(
                signer1Address,
                tokensToSend,
                mockToken.address,
                "",
                {value: calculatedFeeNPG}
            );
            const sig1BalanceAfter = await mockToken.balanceOf(signer1Address);
            const tippingContractTokenBalanceAfter = await mockToken.balanceOf(
                tippingContract.address
            );
            const tippingContractNativeBalanceAfter = await provider.getBalance(
                tippingContract.address
            );
            expect(sig1BalanceAfter).to.equal(sig1BalanceBefore + tokensToSend);
            expect(tippingContractTokenBalanceBefore).to.equal(
                tippingContractTokenBalanceAfter
            );
            expect(tippingContractNativeBalanceAfter).to.equal(
                tippingContractNativeBalanceBefore + calculatedFeeNPG
            );

            await mockToken.increaseAllowance(
                tippingContract.address,
                tokensToSend
            );
            await tippingContract.sendERC20To(
                signer2Address,
                tokensToSend,
                mockToken.address,
                "",
                {value: calculatedFeePG}
            );

            const sig2BalanceAfter = await mockToken.balanceOf(signer2Address);
            const tippingContractTokenBalanceAfter2 = await mockToken.balanceOf(
                tippingContract.address
            );
            const tippingContractNativeBalanceAfter2 =
                await provider.getBalance(tippingContract.address);

            expect(sig2BalanceAfter).to.equal(sig2BalanceBefore + tokensToSend);
            expect(tippingContractTokenBalanceAfter).to.equal(
                tippingContractTokenBalanceAfter2
            );
            expect(tippingContractNativeBalanceAfter2).to.equal(
                tippingContractNativeBalanceBefore +
                    calculatedFeeNPG +
                    calculatedFeePG
            );

            await tippingContract.deletePublicGood(signer2Address);
        });

        it("allows for sending supported ERC20 asset to other address", async () => {
            await tippingContract.addSupportedERC20(mockToken2.address);
            await tippingContract.addPublicGood(signer2Address);

            const tokensToReceive = BigInt("1000000");
            const calculatedFeeNPG = await tippingContract.getPaymentFee(
                tokensToReceive,
                AssetType.SUPPORTED_ERC20,
                signer1Address
            );
            // Confirmed to be 0
            const calculatedFeePG = await tippingContract.getPaymentFee(
                tokensToReceive,
                AssetType.SUPPORTED_ERC20,
                signer2Address
            );
            const tokensToSendNPG = tokensToReceive + calculatedFeeNPG;
            const tokensToSendPG = tokensToReceive + calculatedFeePG;

            const sig1TokenBalanceBefore = await mockToken2.balanceOf(
                signer1Address
            );
            const sig2TokenBalanceBefore = await mockToken2.balanceOf(
                signer2Address
            );
            const tippingContractTokenBalanceBefore =
                await mockToken2.balanceOf(tippingContract.address);

            await mockToken2.increaseAllowance(
                tippingContract.address,
                tokensToSendNPG
            );
            await tippingContract.sendERC20To(
                signer1Address,
                tokensToSendNPG,
                mockToken2.address,
                ""
            );

            const sig1TokenBalanceAfter = await mockToken2.balanceOf(
                signer1Address
            );
            const tippingContractTokenBalanceAfter = await mockToken2.balanceOf(
                tippingContract.address
            );

            expect(sig1TokenBalanceAfter).to.equal(
                sig1TokenBalanceBefore + tokensToReceive
            );
            expect(tippingContractTokenBalanceAfter).to.equal(
                tippingContractTokenBalanceBefore + calculatedFeeNPG
            );

            await mockToken2.increaseAllowance(
                tippingContract.address,
                tokensToSendPG
            );
            await tippingContract.sendERC20To(
                signer2Address,
                tokensToSendPG,
                mockToken2.address,
                ""
            );

            const sig2TokenBalanceAfter = await mockToken2.balanceOf(
                signer2Address
            );
            const tippingContractTokenBalanceAfter2 =
                await mockToken2.balanceOf(tippingContract.address);

            expect(sig2TokenBalanceAfter).to.equal(
                sig2TokenBalanceBefore + tokensToSendPG
            );
            expect(tippingContractTokenBalanceAfter).to.equal(
                tippingContractTokenBalanceAfter2
            );

            await tippingContract.deleteSupportedERC20(mockToken2.address);
            await tippingContract.deletePublicGood(signer2Address);
        });

        it("allows sending supported ERC20 to non-pg addresses as batch", async () => {
            for (let contract of [
                tippingContract,
                tippingContract_noEAS,
                tippingContract_noOracle,
                tippingContract_noEAS_noOracle,
            ]) {
                await contract.addSupportedERC20(mockToken.address);

                const weiToReceive1 = BigInt("1000000");
                const weiToReceive2 = BigInt("2500000");
                const tippingContractBalanceBefore = await provider.getBalance(
                    contract.address
                );
                const tippingContractTokenBalanceBefore =
                    await mockToken.balanceOf(contract.address);
                const sig1BalanceBefore = await mockToken.balanceOf(
                    signer1Address
                );
                const sig2BalanceBefore = await mockToken.balanceOf(
                    signer2Address
                );

                const batchObject1 = {
                    assetType: AssetType.SUPPORTED_ERC20,
                    recipient: signer1Address,
                    amount: weiToReceive1,
                    tokenId: 0,
                    tokenAddress: mockToken.address,
                    message: "",
                };
                const batchObject2 = {
                    assetType: AssetType.SUPPORTED_ERC20,
                    recipient: signer2Address,
                    amount: weiToReceive2,
                    tokenId: 0,
                    tokenAddress: mockToken.address,
                    message: "",
                };

                const batchSendObject = await contract.calculateBatchFee([
                    batchObject1,
                    batchObject2,
                ]);
                let nativeAmountToSend = BigInt(0);
                let tokenAmountToSend = BigInt(0);
                let adjustedBatchSendObject = batchSendObject.map((call) => {
                    nativeAmountToSend += BigInt(call.nativeAmount);
                    tokenAmountToSend = tokenAmountToSend + BigInt(call.amount);
                    return {
                        assetType: call.assetType,
                        recipient: call.recipient,
                        amount: call.amount,
                        tokenId: call.tokenId,
                        tokenAddress: call.tokenAddress,
                        message: call.message,
                    };
                });

                await mockToken.increaseAllowance(
                    contract.address,
                    tokenAmountToSend
                );
                await contract.batchSendTo(adjustedBatchSendObject, {
                    value: nativeAmountToSend,
                });

                const tippingContractBalanceAfter = await provider.getBalance(
                    contract.address
                );
                const tippingContractTokenBalanceAfter =
                    await mockToken.balanceOf(contract.address);
                const sig1BalanceAfter = await mockToken.balanceOf(
                    signer1Address
                );
                const sig2BalanceAfter = await mockToken.balanceOf(
                    signer2Address
                );

                expect(sig1BalanceAfter).to.equal(
                    sig1BalanceBefore + weiToReceive1
                );
                expect(sig2BalanceAfter).to.equal(
                    sig2BalanceBefore + weiToReceive2
                );
                expect(tippingContractTokenBalanceAfter).to.equal(
                    tippingContractTokenBalanceBefore +
                        tokenAmountToSend -
                        weiToReceive1 -
                        weiToReceive2
                );
                expect(tippingContractBalanceAfter).to.equal(
                    tippingContractBalanceBefore
                );

                await contract.deleteSupportedERC20(mockToken.address);
            }
        });

        it("allows sending supported ERC20 to non-pg and pg addresses as batch", async () => {
            for (let contract of [
                tippingContract,
                tippingContract_noEAS,
                tippingContract_noOracle,
                tippingContract_noEAS_noOracle,
            ]) {
                await contract.addSupportedERC20(mockToken.address);
                await contract.addPublicGood(signer2Address);

                const weiToReceive1 = BigInt("1000000");
                const weiToReceive2 = BigInt("2500000");
                const tippingContractBalanceBefore = await provider.getBalance(
                    contract.address
                );
                const tippingContractTokenBalanceBefore =
                    await mockToken.balanceOf(contract.address);
                const sig1BalanceBefore = await mockToken.balanceOf(
                    signer1Address
                );
                const sig2BalanceBefore = await mockToken.balanceOf(
                    signer2Address
                );

                const batchObject1 = {
                    assetType: AssetType.SUPPORTED_ERC20,
                    recipient: signer1Address,
                    amount: weiToReceive1,
                    tokenId: 0,
                    tokenAddress: mockToken.address,
                    message: "",
                };
                const batchObject2 = {
                    assetType: AssetType.SUPPORTED_ERC20,
                    recipient: signer2Address,
                    amount: weiToReceive2,
                    tokenId: 0,
                    tokenAddress: mockToken.address,
                    message: "",
                };

                const batchSendObject = await contract.calculateBatchFee([
                    batchObject1,
                    batchObject2,
                ]);
                let nativeAmountToSend = BigInt(0);
                let tokenAmountToSend = BigInt(0);
                let adjustedBatchSendObject = batchSendObject.map((call) => {
                    nativeAmountToSend += BigInt(call.nativeAmount);
                    tokenAmountToSend = tokenAmountToSend + BigInt(call.amount);
                    return {
                        assetType: call.assetType,
                        recipient: call.recipient,
                        amount: call.amount,
                        tokenId: call.tokenId,
                        tokenAddress: call.tokenAddress,
                        message: call.message,
                    };
                });

                await mockToken.increaseAllowance(
                    contract.address,
                    tokenAmountToSend
                );
                await contract.batchSendTo(adjustedBatchSendObject, {
                    value: nativeAmountToSend,
                });

                const tippingContractBalanceAfter = await provider.getBalance(
                    contract.address
                );
                const tippingContractTokenBalanceAfter =
                    await mockToken.balanceOf(contract.address);
                const sig1BalanceAfter = await mockToken.balanceOf(
                    signer1Address
                );
                const sig2BalanceAfter = await mockToken.balanceOf(
                    signer2Address
                );

                expect(sig1BalanceAfter).to.equal(
                    sig1BalanceBefore + weiToReceive1
                );
                expect(sig2BalanceAfter).to.equal(
                    sig2BalanceBefore + weiToReceive2
                );
                expect(tippingContractTokenBalanceAfter).to.equal(
                    tippingContractTokenBalanceBefore +
                        tokenAmountToSend -
                        weiToReceive1 -
                        weiToReceive2
                );
                expect(tippingContractBalanceAfter).to.equal(
                    tippingContractBalanceBefore
                );

                await contract.deleteSupportedERC20(mockToken.address);
                await contract.deletePublicGood(signer2Address);
            }
        });

        it("allows sending unsupported ERC20 to non-pg addresses as batch", async () => {
            for (let contract of [
                tippingContract,
                tippingContract_noEAS,
                tippingContract_noOracle,
                tippingContract_noEAS_noOracle,
            ]) {
                const weiToReceive1 = BigInt("1000000");
                const weiToReceive2 = BigInt("2500000");
                const tippingContractBalanceBefore = await provider.getBalance(
                    contract.address
                );
                const tippingContractTokenBalanceBefore =
                    await mockToken.balanceOf(contract.address);
                const sig1BalanceBefore = await mockToken.balanceOf(
                    signer1Address
                );
                const sig2BalanceBefore = await mockToken.balanceOf(
                    signer2Address
                );

                const batchObject1 = {
                    assetType: AssetType.ERC20,
                    recipient: signer1Address,
                    amount: weiToReceive1,
                    tokenId: 0,
                    tokenAddress: mockToken.address,
                    message: "",
                };
                const batchObject2 = {
                    assetType: AssetType.ERC20,
                    recipient: signer2Address,
                    amount: weiToReceive2,
                    tokenId: 0,
                    tokenAddress: mockToken.address,
                    message: "",
                };

                const batchSendObject = await contract.calculateBatchFee([
                    batchObject1,
                    batchObject2,
                ]);
                let nativeAmountToSend = BigInt(0);
                let tokenAmountToSend = BigInt(0);
                let adjustedBatchSendObject = batchSendObject.map((call) => {
                    nativeAmountToSend += BigInt(call.nativeAmount);
                    tokenAmountToSend = tokenAmountToSend + BigInt(call.amount);
                    return {
                        assetType: call.assetType,
                        recipient: call.recipient,
                        amount: call.amount,
                        tokenId: call.tokenId,
                        tokenAddress: call.tokenAddress,
                        message: call.message,
                    };
                });

                await mockToken.increaseAllowance(
                    contract.address,
                    tokenAmountToSend
                );
                await contract.batchSendTo(adjustedBatchSendObject, {
                    value: nativeAmountToSend,
                });

                const tippingContractBalanceAfter = await provider.getBalance(
                    contract.address
                );
                const tippingContractTokenBalanceAfter =
                    await mockToken.balanceOf(contract.address);
                const sig1BalanceAfter = await mockToken.balanceOf(
                    signer1Address
                );
                const sig2BalanceAfter = await mockToken.balanceOf(
                    signer2Address
                );

                expect(sig1BalanceAfter).to.equal(
                    sig1BalanceBefore + weiToReceive1
                );
                expect(sig2BalanceAfter).to.equal(
                    sig2BalanceBefore + weiToReceive2
                );
                expect(tippingContractTokenBalanceAfter).to.equal(
                    tippingContractTokenBalanceBefore
                );
                expect(tippingContractBalanceAfter).to.equal(
                    tippingContractBalanceBefore + nativeAmountToSend
                );
            }
        });

        it("allows sending unsupported ERC20 to non-pg and pg addresses as batch", async () => {
            for (let contract of [
                tippingContract,
                tippingContract_noEAS,
                tippingContract_noOracle,
                tippingContract_noEAS_noOracle,
            ]) {
                await contract.addPublicGood(signer2Address);

                const weiToReceive1 = BigInt("1000000");
                const weiToReceive2 = BigInt("2500000");
                const tippingContractBalanceBefore = await provider.getBalance(
                    contract.address
                );
                const tippingContractTokenBalanceBefore =
                    await mockToken.balanceOf(contract.address);
                const sig1BalanceBefore = await mockToken.balanceOf(
                    signer1Address
                );
                const sig2BalanceBefore = await mockToken.balanceOf(
                    signer2Address
                );

                const batchObject1 = {
                    assetType: AssetType.ERC20,
                    recipient: signer1Address,
                    amount: weiToReceive1,
                    tokenId: 0,
                    tokenAddress: mockToken.address,
                    message: "",
                };
                const batchObject2 = {
                    assetType: AssetType.ERC20,
                    recipient: signer2Address,
                    amount: weiToReceive2,
                    tokenId: 0,
                    tokenAddress: mockToken.address,
                    message: "",
                };

                const batchSendObject = await contract.calculateBatchFee([
                    batchObject1,
                    batchObject2,
                ]);
                let nativeAmountToSend = BigInt(0);
                let tokenAmountToSend = BigInt(0);
                let adjustedBatchSendObject = batchSendObject.map((call) => {
                    nativeAmountToSend += BigInt(call.nativeAmount);
                    tokenAmountToSend = tokenAmountToSend + BigInt(call.amount);
                    return {
                        assetType: call.assetType,
                        recipient: call.recipient,
                        amount: call.amount,
                        tokenId: call.tokenId,
                        tokenAddress: call.tokenAddress,
                        message: call.message,
                    };
                });

                await mockToken.increaseAllowance(
                    contract.address,
                    tokenAmountToSend
                );

                await contract.batchSendTo(adjustedBatchSendObject, {
                    value: nativeAmountToSend,
                });

                const tippingContractBalanceAfter = await provider.getBalance(
                    contract.address
                );
                const tippingContractTokenBalanceAfter =
                    await mockToken.balanceOf(contract.address);
                const sig1BalanceAfter = await mockToken.balanceOf(
                    signer1Address
                );
                const sig2BalanceAfter = await mockToken.balanceOf(
                    signer2Address
                );

                expect(sig1BalanceAfter).to.equal(
                    sig1BalanceBefore + weiToReceive1
                );
                expect(sig2BalanceAfter).to.equal(
                    sig2BalanceBefore + weiToReceive2
                );
                expect(tippingContractTokenBalanceAfter).to.equal(
                    tippingContractTokenBalanceBefore
                );
                expect(tippingContractBalanceAfter).to.equal(
                    tippingContractBalanceBefore + nativeAmountToSend
                );

                await contract.deletePublicGood(signer2Address);
            }
        });

        it("emits a TipMessage event", async () => {
            const tokensToSend = BigInt("1000000");
            const calculatedFee = await tippingContract.getPaymentFee(
                tokensToSend,
                AssetType.ERC20,
                signer1Address
            );
            await mockToken.increaseAllowance(
                tippingContract.address,
                tokensToSend
            );

            await expect(
                tippingContract.sendERC20To(
                    signer1Address,
                    tokensToSend,
                    mockToken.address,
                    "xyz",
                    {value: calculatedFee}
                )
            )
                .to.emit(tippingContract, "TipMessage")
                .withArgs(
                    signer1Address,
                    "xyz",
                    ownerAddress,
                    AssetType.ERC20,
                    mockToken.address,
                    0,
                    tokensToSend,
                    calculatedFee
                );
        });

        it("Correctly emits an Attested event", async () => {
            await tippingContract.addPublicGood(signer1Address);
            await tippingContract_noEAS.addPublicGood(signer1Address);

            const tokensToSend = BigInt("1000000");
            await mockToken.increaseAllowance(
                tippingContract.address,
                tokensToSend * BigInt("2")
            );
            await mockToken.increaseAllowance(
                tippingContract_noEAS.address,
                tokensToSend
            );
            await expect(
                tippingContract.sendERC20To(
                    signer1Address,
                    tokensToSend,
                    mockToken.address,
                    "",
                    {value: 0}
                )
            )
                .to.emit(mockEAS, "Attested")
                .withArgs(ownerAddress, tippingContract.address, schema);

            await expect(
                tippingContract_noEAS.sendERC20To(
                    signer1Address,
                    tokensToSend,
                    mockToken.address,
                    "",
                    {value: 0}
                )
            ).to.not.emit(mockEAS, "Attested");

            await tippingContract.disableEASSupport();

            await expect(
                tippingContract.sendERC20To(
                    signer1Address,
                    tokensToSend,
                    mockToken.address,
                    "",
                    {value: 0}
                )
            ).to.not.emit(mockEAS, "Attested");

            await tippingContract.enableEASSupport(mockEAS.address, schema);
            await tippingContract.deletePublicGood(signer1Address);
            await tippingContract_noEAS.deletePublicGood(signer1Address);
        });
    });

    describe("Send ERC721", () => {
        it("properly calculates fee when sending asset", async () => {
            await tippingContract.addPublicGood(signer2Address);
            await tippingContract_noOracle.addPublicGood(signer2Address);
            await tippingContract_noEAS_noOracle.addPublicGood(signer2Address);

            const tokenToSend = 1;

            const calculatedFeeNonPG = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC721,
                signer1Address
            );
            const calculatedFeePG = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC721,
                signer2Address
            );

            const calculatedFeeNonPG_noOracle =
                await tippingContract_noOracle.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC721,
                    signer1Address
                );
            const calculatedFeePG_noOracle =
                await tippingContract_noOracle.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC721,
                    signer2Address
                );

            const calculatedFeeNonPG_noEAS_noOracle =
                await tippingContract_noEAS_noOracle.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC721,
                    signer1Address
                );
            const calculatedFeePG_noEAS_noOracle =
                await tippingContract_noEAS_noOracle.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC721,
                    signer2Address
                );

            expect(calculatedFeeNonPG).to.equal(dollarInWei);
            expect(calculatedFeeNonPG_noOracle).to.equal(dollarInWeiFallback);
            expect(calculatedFeeNonPG_noEAS_noOracle).to.equal(
                dollarInWeiFallback
            );
            expect(calculatedFeePG).to.equal(0);
            expect(calculatedFeePG_noOracle).to.equal(0);
            expect(calculatedFeePG_noEAS_noOracle).to.equal(0);

            await tippingContract.deletePublicGood(signer2Address);
            await tippingContract_noOracle.deletePublicGood(signer2Address);
            await tippingContract_noEAS_noOracle.deletePublicGood(
                signer2Address
            );
        });

        it("allows for sending asset to other address", async () => {
            await tippingContract.addPublicGood(signer2Address);
            const tokenToSend = 1;
            const tokenToSend2 = 2;
            const calculatedFeeNonPG = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC721,
                signer1Address
            );
            const calculatedFeePG = await tippingContract.getPaymentFee(
                tokenToSend2,
                AssetType.ERC721,
                signer2Address
            );

            await mockNFT.approve(tippingContract.address, tokenToSend);
            await tippingContract.sendERC721To(
                signer1Address,
                tokenToSend,
                mockNFT.address,
                "",
                {value: calculatedFeeNonPG}
            );

            await mockNFT.approve(tippingContract.address, tokenToSend2);
            await tippingContract.sendERC721To(
                signer2Address,
                tokenToSend2,
                mockNFT.address,
                "",
                {value: calculatedFeePG}
            );

            expect(await mockNFT.ownerOf(tokenToSend)).to.equal(signer1Address);
            expect(await mockNFT.ownerOf(tokenToSend2)).to.equal(
                signer2Address
            );

            await tippingContract.deletePublicGood(signer2Address);
        });

        it("allows for sending asset to non-pg addresses as batch", async () => {
            const tokenToSend3 = 3;
            const tokenToSend4 = 4;
            const tippingContractBalanceBefore = await provider.getBalance(
                tippingContract.address
            );

            const batchObject1 = {
                assetType: AssetType.ERC721,
                recipient: signer1Address,
                amount: 1,
                tokenId: 3,
                tokenAddress: mockNFT.address,
                message: "",
            };
            const batchObject2 = {
                assetType: AssetType.ERC721,
                recipient: signer2Address,
                amount: 1,
                tokenId: 4,
                tokenAddress: mockNFT.address,
                message: "",
            };

            const batchSendObject = await tippingContract.calculateBatchFee([
                batchObject1,
                batchObject2,
            ]);
            let nativeAmountToSend = BigInt(0);
            let adjustedBatchSendObject = batchSendObject.map((call) => {
                nativeAmountToSend += BigInt(call.nativeAmount);
                return {
                    assetType: call.assetType,
                    recipient: call.recipient,
                    amount: call.amount,
                    tokenId: call.tokenId,
                    tokenAddress: call.tokenAddress,
                    message: call.message,
                };
            });

            await mockNFT.approve(tippingContract.address, tokenToSend3);
            await mockNFT.approve(tippingContract.address, tokenToSend4);

            await tippingContract.batchSendTo(adjustedBatchSendObject, {
                value: nativeAmountToSend,
            });
            const tippingContractBalanceAfter = await provider.getBalance(
                tippingContract.address
            );

            expect(await mockNFT.ownerOf(tokenToSend3)).to.equal(
                signer1Address
            );
            expect(await mockNFT.ownerOf(tokenToSend4)).to.equal(
                signer2Address
            );
            expect(tippingContractBalanceAfter).to.equal(
                tippingContractBalanceBefore + dollarInWei + dollarInWei
            );
        });

        it("allows for sending asset to other address (PG and Non-PG) as batch", async () => {
            await tippingContract.addPublicGood(signer2Address);

            const tokenToSend5 = 5;
            const tokenToSend6 = 6;
            const tippingContractBalanceBefore = await provider.getBalance(
                tippingContract.address
            );

            const batchObject1 = {
                assetType: AssetType.ERC721,
                recipient: signer1Address,
                amount: 1,
                tokenId: 5,
                tokenAddress: mockNFT.address,
                message: "",
            };
            const batchObject2 = {
                assetType: AssetType.ERC721,
                recipient: signer2Address,
                amount: 1,
                tokenId: 6,
                tokenAddress: mockNFT.address,
                message: "",
            };

            const batchSendObject = await tippingContract.calculateBatchFee([
                batchObject1,
                batchObject2,
            ]);
            let nativeAmountToSend = BigInt(0);
            let adjustedBatchSendObject = batchSendObject.map((call) => {
                nativeAmountToSend += BigInt(call.nativeAmount);
                return {
                    assetType: call.assetType,
                    recipient: call.recipient,
                    amount: call.amount,
                    tokenId: call.tokenId,
                    tokenAddress: call.tokenAddress,
                    message: call.message,
                };
            });

            await mockNFT.approve(tippingContract.address, tokenToSend5);
            await mockNFT.approve(tippingContract.address, tokenToSend6);

            await tippingContract.batchSendTo(adjustedBatchSendObject, {
                value: nativeAmountToSend,
            });
            const tippingContractBalanceAfter = await provider.getBalance(
                tippingContract.address
            );

            expect(await mockNFT.ownerOf(tokenToSend5)).to.equal(
                signer1Address
            );
            expect(await mockNFT.ownerOf(tokenToSend6)).to.equal(
                signer2Address
            );
            expect(tippingContractBalanceAfter).to.equal(
                tippingContractBalanceBefore + dollarInWei
            );

            await tippingContract.deletePublicGood(signer2Address);
        });

        it("reverts when fee is too small", async () => {
            const assetIdToSend = 7;
            await mockNFT.approve(tippingContract.address, assetIdToSend);

            await expect(
                tippingContract.sendERC721To(
                    signer1Address,
                    assetIdToSend,
                    mockNFT.address,
                    "",
                    {value: dollarInWei / BigInt("2")}
                )
            ).to.be.revertedWithCustomError(
                tippingContract,
                "ValueSentTooSmall"
            );
        });

        it("emits a TipMessage event", async () => {
            await mockNFT.approve(tippingContract.address, 7);
            await expect(
                tippingContract.sendERC721To(
                    signer1Address,
                    7,
                    mockNFT.address,
                    "xyz",
                    {value: dollarInWei}
                )
            )
                .to.emit(tippingContract, "TipMessage")
                .withArgs(
                    signer1Address,
                    "xyz",
                    ownerAddress,
                    AssetType.ERC721,
                    mockNFT.address,
                    7,
                    1,
                    dollarInWei
                );
        });

        it("Correctly emits an Attested event", async () => {
            const assetIdToSend1 = 8;
            const assetIdToSend2 = 9;
            await tippingContract.addPublicGood(signer1Address);

            await mockNFT.approve(tippingContract.address, assetIdToSend1);
            await mockNFT.approve(
                tippingContract_noEAS.address,
                assetIdToSend2
            );
            await expect(
                tippingContract.sendERC721To(
                    signer1Address,
                    assetIdToSend1,
                    mockNFT.address,
                    "",
                    {value: dollarInWei}
                )
            )
                .to.emit(mockEAS, "Attested")
                .withArgs(ownerAddress, tippingContract.address, schema);

            await expect(
                tippingContract_noEAS.sendERC721To(
                    signer1Address,
                    assetIdToSend2,
                    mockNFT.address,
                    "",
                    {value: dollarInWei}
                )
            ).to.not.emit(mockEAS, "Attested");
            await tippingContract.deletePublicGood(signer1Address);
        });
    });

    describe("Send ERC1155", () => {
        it("properly calculates fee when sending asset", async () => {
            await tippingContract.addPublicGood(signer2Address);
            await tippingContract_noOracle.addPublicGood(signer2Address);
            await tippingContract_noEAS_noOracle.addPublicGood(signer2Address);

            const tokenToSend = 1;

            const calculatedFeeNonPG = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC1155,
                signer1Address
            );
            const calculatedFeePG = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC1155,
                signer2Address
            );

            const calculatedFeeNonPG_noOracle =
                await tippingContract_noOracle.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC1155,
                    signer1Address
                );
            const calculatedFeePG_noOracle =
                await tippingContract_noOracle.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC1155,
                    signer2Address
                );

            const calculatedFeeNonPG_noEAS_noOracle =
                await tippingContract_noEAS_noOracle.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC1155,
                    signer1Address
                );
            const calculatedFeePG_noEAS_noOracle =
                await tippingContract_noEAS_noOracle.getPaymentFee(
                    tokenToSend,
                    AssetType.ERC1155,
                    signer2Address
                );

            expect(calculatedFeeNonPG).to.equal(dollarInWei);
            expect(calculatedFeeNonPG_noOracle).to.equal(dollarInWeiFallback);
            expect(calculatedFeeNonPG_noEAS_noOracle).to.equal(
                dollarInWeiFallback
            );
            expect(calculatedFeePG).to.equal(0);
            expect(calculatedFeePG_noOracle).to.equal(0);
            expect(calculatedFeePG_noEAS_noOracle).to.equal(0);

            await tippingContract.deletePublicGood(signer2Address);
            await tippingContract_noOracle.deletePublicGood(signer2Address);
            await tippingContract_noEAS_noOracle.deletePublicGood(
                signer2Address
            );
        });

        it("allows for sending asset to other address", async () => {
            await tippingContract.addPublicGood(signer2Address);
            const tokenToSend = 1;
            const tokenToSend2 = 2;
            const calculatedFeeNonPG = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC721,
                signer1Address
            );
            const calculatedFeePG = await tippingContract.getPaymentFee(
                tokenToSend2,
                AssetType.ERC721,
                signer2Address
            );

            const tippingContractBalanceBefore = await provider.getBalance(
                tippingContract.address
            );

            const sig1BalanceBefore = await mockERC1155.balanceOf(
                signer1Address,
                tokenToSend
            );
            const sig2BalanceBefore = await mockERC1155.balanceOf(
                signer2Address,
                tokenToSend2
            );

            await mockERC1155.setApprovalForAll(tippingContract.address, true);
            await tippingContract.sendERC1155To(
                signer1Address,
                tokenToSend,
                1,
                mockERC1155.address,
                "",
                {value: calculatedFeeNonPG}
            );
            await tippingContract.sendERC1155To(
                signer2Address,
                tokenToSend2,
                1,
                mockERC1155.address,
                "",
                {value: calculatedFeePG}
            );

            const tippingContractBalanceAfter = await provider.getBalance(
                tippingContract.address
            );
            const sig1BalanceAfter = await mockERC1155.balanceOf(
                signer1Address,
                tokenToSend
            );
            const sig2BalanceAfter = await mockERC1155.balanceOf(
                signer2Address,
                tokenToSend2
            );

            expect(sig1BalanceBefore).to.be.equal(0);
            expect(sig1BalanceAfter).to.be.equal(1);
            expect(sig2BalanceBefore).to.be.equal(0);
            expect(sig2BalanceAfter).to.be.equal(1);
            expect(tippingContractBalanceAfter).to.equal(
                tippingContractBalanceBefore +
                    calculatedFeeNonPG +
                    calculatedFeePG
            );
            expect(tippingContractBalanceAfter).to.equal(
                tippingContractBalanceBefore + dollarInWei
            );

            await tippingContract.deletePublicGood(signer2Address);
        });

        it("allows for sending asset to other non-PG addresses as batch", async () => {
            const erc1155ID = 3;
            const amount1 = 2;
            const amount2 = 3;
            const tippingContractNativeBalanceBefore =
                await provider.getBalance(tippingContract.address);

            const sig1ERC1155BalanceBefore = await mockERC1155.balanceOf(
                signer1Address,
                erc1155ID
            );
            const sig2ERC1155BalanceBefore = await mockERC1155.balanceOf(
                signer2Address,
                erc1155ID
            );

            const batchObject1 = {
                assetType: AssetType.ERC1155,
                recipient: signer1Address,
                amount: amount1,
                tokenId: erc1155ID,
                tokenAddress: mockERC1155.address,
                message: "",
            };
            const batchObject2 = {
                assetType: AssetType.ERC1155,
                recipient: signer2Address,
                amount: amount2,
                tokenId: erc1155ID,
                tokenAddress: mockERC1155.address,
                message: "",
            };

            const batchSendObject = await tippingContract.calculateBatchFee([
                batchObject1,
                batchObject2,
            ]);
            let nativeAmountToSend = BigInt(0);
            let adjustedBatchSendObject = batchSendObject.map((call) => {
                nativeAmountToSend += BigInt(call.nativeAmount);
                return {
                    assetType: call.assetType,
                    recipient: call.recipient,
                    amount: call.amount,
                    tokenId: call.tokenId,
                    tokenAddress: call.tokenAddress,
                    message: call.message,
                };
            });

            await mockERC1155.setApprovalForAll(tippingContract.address, true);

            await tippingContract.batchSendTo(adjustedBatchSendObject, {
                value: nativeAmountToSend,
            });

            const tippingContractNativeBalanceAfter = await provider.getBalance(
                tippingContract.address
            );
            const tippingContractERC1155BalanceAfter =
                await mockERC1155.balanceOf(tippingContract.address, erc1155ID);
            const sig1ERC1155BalanceAfter = await mockERC1155.balanceOf(
                signer1Address,
                erc1155ID
            );
            const sig2ERC1155BalanceAfter = await mockERC1155.balanceOf(
                signer2Address,
                erc1155ID
            );

            expect(sig1ERC1155BalanceBefore).to.be.equal(0);
            expect(sig1ERC1155BalanceAfter).to.be.equal(2);
            expect(sig2ERC1155BalanceBefore).to.be.equal(0);
            expect(sig2ERC1155BalanceAfter).to.be.equal(3);
            expect(tippingContractNativeBalanceAfter).to.equal(
                tippingContractNativeBalanceBefore + dollarInWei + dollarInWei
            );
        });

        it("allows for sending asset to other address (PG and Non-PG) as batch", async () => {
            await tippingContract.addPublicGood(signer2Address);

            const erc1155ID = 3;
            const amount1 = BigInt("4");
            const amount2 = BigInt("1");
            const tippingContractNativeBalanceBefore =
                await provider.getBalance(tippingContract.address);

            const sig1ERC1155BalanceBefore = await mockERC1155.balanceOf(
                signer1Address,
                erc1155ID
            );
            const sig2ERC1155BalanceBefore = await mockERC1155.balanceOf(
                signer2Address,
                erc1155ID
            );

            const batchObject1 = {
                assetType: AssetType.ERC1155,
                recipient: signer1Address,
                amount: amount1,
                tokenId: erc1155ID,
                tokenAddress: mockERC1155.address,
                message: "",
            };
            const batchObject2 = {
                assetType: AssetType.ERC1155,
                recipient: signer2Address,
                amount: amount2,
                tokenId: erc1155ID,
                tokenAddress: mockERC1155.address,
                message: "",
            };

            const batchSendObject = await tippingContract.calculateBatchFee([
                batchObject1,
                batchObject2,
            ]);
            let nativeAmountToSend = BigInt(0);
            let adjustedBatchSendObject = batchSendObject.map((call) => {
                nativeAmountToSend += BigInt(call.nativeAmount);
                return {
                    assetType: call.assetType,
                    recipient: call.recipient,
                    amount: call.amount,
                    tokenId: call.tokenId,
                    tokenAddress: call.tokenAddress,
                    message: call.message,
                };
            });

            await mockERC1155.setApprovalForAll(tippingContract.address, true);

            await tippingContract.batchSendTo(adjustedBatchSendObject, {
                value: nativeAmountToSend,
            });

            const tippingContractNativeBalanceAfter = await provider.getBalance(
                tippingContract.address
            );

            const sig1ERC1155BalanceAfter = await mockERC1155.balanceOf(
                signer1Address,
                erc1155ID
            );
            const sig2ERC1155BalanceAfter = await mockERC1155.balanceOf(
                signer2Address,
                erc1155ID
            );

            expect(sig1ERC1155BalanceAfter).to.be.equal(
                sig1ERC1155BalanceBefore + amount1
            );
            expect(sig2ERC1155BalanceAfter).to.be.equal(
                sig2ERC1155BalanceBefore + amount2
            );
            expect(tippingContractNativeBalanceAfter).to.equal(
                tippingContractNativeBalanceBefore + dollarInWei
            );

            await tippingContract.deletePublicGood(signer2Address);
        });

        it("reverts when fee is too small", async () => {
            await mockERC1155.setApprovalForAll(tippingContract.address, true);

            await expect(
                tippingContract.sendERC1155To(
                    signer1Address,
                    1,
                    1,
                    mockERC1155.address,
                    "",
                    {value: dollarInWei / BigInt("2")}
                )
            ).to.be.revertedWithCustomError(
                tippingContract,
                "ValueSentTooSmall"
            );

            const batchObject1 = {
                assetType: AssetType.ERC1155,
                recipient: signer1Address,
                amount: 5,
                tokenId: 4,
                tokenAddress: mockERC1155.address,
                message: "",
            };
            const batchObject2 = {
                assetType: AssetType.ERC1155,
                recipient: signer2Address,
                amount: 100,
                tokenId: 5,
                tokenAddress: mockERC1155.address,
                message: "",
            };

            const batchSendObject = await tippingContract.calculateBatchFee([
                batchObject1,
                batchObject2,
            ]);
            let nativeAmountToSend = BigInt(0);
            let adjustedBatchSendObject = batchSendObject.map((call) => {
                nativeAmountToSend += BigInt(call.nativeAmount);
                return {
                    assetType: call.assetType,
                    recipient: call.recipient,
                    amount: call.amount,
                    tokenId: call.tokenId,
                    tokenAddress: call.tokenAddress,
                    message: call.message,
                };
            });

            await expect(
                tippingContract.batchSendTo(adjustedBatchSendObject, {
                    value: nativeAmountToSend / BigInt("2"),
                })
            ).to.be.revertedWithCustomError(
                tippingContract,
                "FeeHigherThanProvidedNativeCurrency"
            );
        });

        it("emits a TipMessage event", async () => {
            const amountToSend = 10;
            const IdToSend = 3;
            await mockERC1155.setApprovalForAll(tippingContract.address, true);

            await expect(
                tippingContract.sendERC1155To(
                    signer1Address,
                    IdToSend,
                    amountToSend,
                    mockERC1155.address,
                    "xyz",
                    {value: dollarInWei}
                )
            )
                .to.emit(tippingContract, "TipMessage")
                .withArgs(
                    signer1Address,
                    "xyz",
                    ownerAddress,
                    AssetType.ERC1155,
                    mockERC1155.address,
                    IdToSend,
                    amountToSend,
                    dollarInWei
                );
        });

        it("Correctly emits an Attested event", async () => {
            await tippingContract.addPublicGood(signer1Address);
            await tippingContract_noEAS.addPublicGood(signer1Address);

            const amountToSend = 5;
            const IdToSend = 4;
            await mockERC1155.setApprovalForAll(tippingContract.address, true);
            await mockERC1155.setApprovalForAll(
                tippingContract_noEAS.address,
                true
            );

            await expect(
                tippingContract.sendERC1155To(
                    signer1Address,
                    IdToSend,
                    amountToSend,
                    mockERC1155.address,
                    "",
                    {value: dollarInWei}
                )
            )
                .to.emit(mockEAS, "Attested")
                .withArgs(ownerAddress, tippingContract.address, schema);

            await expect(
                tippingContract_noEAS.sendERC1155To(
                    signer1Address,
                    IdToSend,
                    amountToSend,
                    mockERC1155.address,
                    "",
                    {value: dollarInWei}
                )
            ).to.not.emit(mockEAS, "Attested");

            await tippingContract.deletePublicGood(signer1Address);
            await tippingContract_noEAS.deletePublicGood(signer1Address);
        });
    });

    describe("Send multiple assets", () => {
        it("properly sends multiple assets", async () => {
            await tippingContract.addSupportedERC20(mockToken2.address);

            const nativeWeiToReceive = BigInt("1000000");
            const erc20WeiToReceive = BigInt("2000000");
            const supportedErc20WeiToReceive = BigInt("3000000");
            const erc721ToReceive = BigInt("1");
            const erc1155ToReceive = BigInt("7");
            const erc721ID = BigInt("10");
            const erc1155ID = BigInt("5");

            const tippingContractSupportedERC20BalanceBefore =
                await mockToken2.balanceOf(tippingContract.address);
            const tippingContractNativeBalanceBefore =
                await provider.getBalance(tippingContract.address);
            const tippingContractERC20BalanceBefore = await mockToken.balanceOf(
                tippingContract.address
            );
            const sig1ERC1155BalanceBefore = await mockERC1155.balanceOf(
                signer1Address,
                erc1155ID
            );

            const batchObject1 = {
                assetType: AssetType.Native,
                recipient: signer1Address,
                amount: nativeWeiToReceive,
                tokenId: 0,
                tokenAddress: ZERO_ADDRESS,
                message: "",
            };
            const batchObject2 = {
                assetType: AssetType.ERC20,
                recipient: signer1Address,
                amount: erc20WeiToReceive,
                tokenId: 0,
                tokenAddress: mockToken.address,
                message: "",
            };
            const batchObject3 = {
                assetType: AssetType.SUPPORTED_ERC20,
                recipient: signer1Address,
                amount: supportedErc20WeiToReceive,
                tokenId: 0,
                tokenAddress: mockToken2.address,
                message: "",
            };
            const batchObject4 = {
                assetType: AssetType.ERC721,
                recipient: signer1Address,
                amount: erc721ToReceive,
                tokenId: erc721ID,
                tokenAddress: mockNFT.address,
                message: "",
            };
            const batchObject5 = {
                assetType: AssetType.ERC1155,
                recipient: signer1Address,
                amount: erc1155ToReceive,
                tokenId: erc1155ID,
                tokenAddress: mockERC1155.address,
                message: "",
            };

            const batchSendObject = await tippingContract.calculateBatchFee([
                batchObject1,
                batchObject2,
                batchObject3,
                batchObject4,
                batchObject5,
            ]);

            let nativeAmountToSend = BigInt(0);
            let mockTokenAmountToSend = BigInt(0);
            let mockToken2AmountToSend = BigInt(0);
            let adjustedBatchSendObject = batchSendObject.map((call) => {
                nativeAmountToSend += BigInt(call.nativeAmount);
                if (call.tokenAddress == mockToken.address)
                    mockTokenAmountToSend += BigInt(call.amount);
                if (call.tokenAddress == mockToken2.address)
                    mockToken2AmountToSend += BigInt(call.amount);
                return {
                    assetType: call.assetType,
                    recipient: call.recipient,
                    amount: call.amount,
                    tokenId: call.tokenId,
                    tokenAddress: call.tokenAddress,
                    message: call.message,
                };
            });

            await mockToken.increaseAllowance(
                tippingContract.address,
                mockTokenAmountToSend
            );
            await mockToken2.increaseAllowance(
                tippingContract.address,
                mockToken2AmountToSend
            );

            await mockNFT.approve(tippingContract.address, erc721ID);
            await mockERC1155.setApprovalForAll(tippingContract.address, true);

            await tippingContract.batchSendTo(adjustedBatchSendObject, {
                value: nativeAmountToSend,
            });

            const tippingContractNativeBalanceAfter = await provider.getBalance(
                tippingContract.address
            );
            const tippingContractERC20BalanceAfter = await mockToken.balanceOf(
                tippingContract.address
            );
            const tippingContractSupportedERC20BalanceAfter =
                await mockToken2.balanceOf(tippingContract.address);
            const sig1ERC1155BalanceAfter = await mockERC1155.balanceOf(
                signer1Address,
                erc1155ID
            );
            expect(tippingContractNativeBalanceAfter).to.equal(
                tippingContractNativeBalanceBefore +
                    dollarInWei * BigInt(3) +
                    nativeWeiToReceive / BigInt(100)
            );
            expect(tippingContractERC20BalanceAfter).to.equal(
                tippingContractERC20BalanceBefore
            );
            expect(tippingContractSupportedERC20BalanceAfter).to.equal(
                tippingContractSupportedERC20BalanceBefore +
                    supportedErc20WeiToReceive / BigInt(100)
            );
            expect(sig1ERC1155BalanceAfter).to.equal(
                sig1ERC1155BalanceBefore + erc1155ToReceive
            );
            expect(await mockNFT.ownerOf(erc721ID)).to.equal(signer1Address);
            await tippingContract.deleteSupportedERC20(mockToken2.address);
        });

        it("Sending less than oracleFee but more than slippage threshold in native fee works for batch", async () => {
            const tokensToSend = BigInt("1000000");
            const weiToSend = dollarInWei;

            await mockToken.increaseAllowance(
                tippingContract.address,
                tokensToSend
            );

            const batchObject1 = {
                assetType: AssetType.Native,
                recipient: signer1Address,
                amount: weiToSend,
                tokenId: 0,
                tokenAddress: ZERO_ADDRESS,
                message: "",
            };
            const batchObject2 = {
                assetType: AssetType.ERC20,
                recipient: signer1Address,
                amount: tokensToSend,
                tokenId: 0,
                tokenAddress: mockToken.address,
                message: "",
            };

            const batchSendObject = await tippingContract.calculateBatchFee([
                batchObject1,
                batchObject2,
            ]);

            let nativeAmountToSend = BigInt(0);
            let mockTokenAmountToSend = BigInt(0);
            let adjustedBatchSendObject = batchSendObject.map((call) => {
                nativeAmountToSend += BigInt(call.nativeAmount);
                if (call.tokenAddress == mockToken.address)
                    mockTokenAmountToSend += BigInt(call.amount);
                return {
                    assetType: call.assetType,
                    recipient: call.recipient,
                    amount: call.amount,
                    tokenId: call.tokenId,
                    tokenAddress: call.tokenAddress,
                    message: call.message,
                };
            });

            await expect(
                tippingContract.batchSendTo(adjustedBatchSendObject, {
                    value:
                        (nativeAmountToSend * (BigInt("100") - BigInt("2"))) /
                        BigInt("100"),
                })
            ).to.not.be.reverted;
        });

        it("reverts when trying to send more than msg.value", async () => {
            const tokensToSend = BigInt("1000000");
            const weiToSend = dollarInWei;

            await mockToken.increaseAllowance(
                tippingContract.address,
                tokensToSend
            );

            const batchObject1 = {
                assetType: AssetType.Native,
                recipient: signer1Address,
                amount: weiToSend,
                tokenId: 0,
                tokenAddress: ZERO_ADDRESS,
                message: "",
            };
            const batchObject2 = {
                assetType: AssetType.ERC20,
                recipient: signer1Address,
                amount: tokensToSend,
                tokenId: 0,
                tokenAddress: mockToken.address,
                message: "",
            };

            await expect(
                tippingContract.batchSendTo([batchObject1, batchObject2], {
                    value: dollarInWei,
                })
            ).to.be.revertedWithCustomError(
                tippingContract,
                "FeeHigherThanProvidedNativeCurrency"
            );
        });
    });

    describe("Miscellaneous", () => {
        it("No EAS + No Chainlink batch works", async () => {
            await tippingContract_noEAS_noOracle.addSupportedERC20(
                mockToken2.address
            );

            const nativeWeiToReceive = BigInt("1000000");
            const erc20WeiToReceive = BigInt("2000000");
            const supportedErc20WeiToReceive = BigInt("3000000");
            const erc721ToReceive = BigInt("1");
            const erc1155ToReceive = BigInt("7");
            const erc721ID = BigInt("11");
            const erc1155ID = BigInt("5");

            const tippingContractSupportedERC20BalanceBefore =
                await mockToken2.balanceOf(
                    tippingContract_noEAS_noOracle.address
                );
            const tippingContractNativeBalanceBefore =
                await provider.getBalance(
                    tippingContract_noEAS_noOracle.address
                );
            const tippingContractERC20BalanceBefore = await mockToken.balanceOf(
                tippingContract_noEAS_noOracle.address
            );
            const sig1ERC1155BalanceBefore = await mockERC1155.balanceOf(
                signer1Address,
                erc1155ID
            );

            const batchObject1 = {
                assetType: AssetType.Native,
                recipient: signer1Address,
                amount: nativeWeiToReceive,
                tokenId: 0,
                tokenAddress: ZERO_ADDRESS,
                message: "",
            };
            const batchObject2 = {
                assetType: AssetType.ERC20,
                recipient: signer1Address,
                amount: erc20WeiToReceive,
                tokenId: 0,
                tokenAddress: mockToken.address,
                message: "",
            };
            const batchObject3 = {
                assetType: AssetType.SUPPORTED_ERC20,
                recipient: signer1Address,
                amount: supportedErc20WeiToReceive,
                tokenId: 0,
                tokenAddress: mockToken2.address,
                message: "",
            };
            const batchObject4 = {
                assetType: AssetType.ERC721,
                recipient: signer1Address,
                amount: erc721ToReceive,
                tokenId: erc721ID,
                tokenAddress: mockNFT.address,
                message: "",
            };
            const batchObject5 = {
                assetType: AssetType.ERC1155,
                recipient: signer1Address,
                amount: erc1155ToReceive,
                tokenId: erc1155ID,
                tokenAddress: mockERC1155.address,
                message: "",
            };

            const batchSendObject =
                await tippingContract_noEAS_noOracle.calculateBatchFee([
                    batchObject1,
                    batchObject2,
                    batchObject3,
                    batchObject4,
                    batchObject5,
                ]);

            let nativeAmountToSend = BigInt(0);
            let mockTokenAmountToSend = BigInt(0);
            let mockToken2AmountToSend = BigInt(0);
            let adjustedBatchSendObject = batchSendObject.map((call) => {
                nativeAmountToSend += BigInt(call.nativeAmount);
                if (call.tokenAddress == mockToken.address)
                    mockTokenAmountToSend += BigInt(call.amount);
                if (call.tokenAddress == mockToken2.address)
                    mockToken2AmountToSend += BigInt(call.amount);
                return {
                    assetType: call.assetType,
                    recipient: call.recipient,
                    amount: call.amount,
                    tokenId: call.tokenId,
                    tokenAddress: call.tokenAddress,
                    message: call.message,
                };
            });

            await mockToken.increaseAllowance(
                tippingContract_noEAS_noOracle.address,
                mockTokenAmountToSend
            );
            await mockToken2.increaseAllowance(
                tippingContract_noEAS_noOracle.address,
                mockToken2AmountToSend
            );

            await mockNFT.approve(
                tippingContract_noEAS_noOracle.address,
                erc721ID
            );
            await mockERC1155.setApprovalForAll(
                tippingContract_noEAS_noOracle.address,
                true
            );

            await tippingContract_noEAS_noOracle.batchSendTo(
                adjustedBatchSendObject,
                {
                    value: nativeAmountToSend,
                }
            );

            const tippingContractNativeBalanceAfter = await provider.getBalance(
                tippingContract_noEAS_noOracle.address
            );
            const tippingContractERC20BalanceAfter = await mockToken.balanceOf(
                tippingContract_noEAS_noOracle.address
            );
            const tippingContractSupportedERC20BalanceAfter =
                await mockToken2.balanceOf(
                    tippingContract_noEAS_noOracle.address
                );
            const sig1ERC1155BalanceAfter = await mockERC1155.balanceOf(
                signer1Address,
                erc1155ID
            );
            expect(tippingContractNativeBalanceAfter).to.equal(
                tippingContractNativeBalanceBefore +
                    dollarInWeiFallback * BigInt(3) +
                    nativeWeiToReceive / BigInt(100)
            );
            expect(tippingContractERC20BalanceAfter).to.equal(
                tippingContractERC20BalanceBefore
            );
            expect(tippingContractSupportedERC20BalanceAfter).to.equal(
                tippingContractSupportedERC20BalanceBefore +
                    supportedErc20WeiToReceive / BigInt(100)
            );
            expect(sig1ERC1155BalanceAfter).to.equal(
                sig1ERC1155BalanceBefore + erc1155ToReceive
            );
            expect(await mockNFT.ownerOf(erc721ID)).to.equal(signer1Address);
            await tippingContract_noEAS_noOracle.deleteSupportedERC20(
                mockToken2.address
            );
        });

        it("Sending less than oracleFee but more than slippage threshold in native fee works", async () => {
            const mockTokenAmountToSend = BigInt("1000000");

            const tippingContractERC20BalanceBefore = await mockToken.balanceOf(
                tippingContract.address
            );
            const signer1ERC20BalanceBefore = await mockToken.balanceOf(
                signer1Address
            );
            const tippingContractNativeBalanceBefore =
                await provider.getBalance(tippingContract.address);

            await mockToken.increaseAllowance(
                tippingContract.address,
                mockTokenAmountToSend
            );

            await tippingContract.sendERC20To(
                signer1Address,
                mockTokenAmountToSend,
                mockToken.address,
                "",
                {value: (dollarInWei * BigInt(97)) / BigInt(100)}
            );

            const tippingContractNativeBalanceAfter = await provider.getBalance(
                tippingContract
            );
            const tippingContractERC20BalanceAfter = await mockToken.balanceOf(
                tippingContract
            );
            const signer1ERC20BalanceAfter = await mockToken.balanceOf(
                signer1Address
            );

            expect(tippingContractNativeBalanceAfter).to.equal(
                tippingContractNativeBalanceBefore +
                    (dollarInWei * BigInt(97)) / BigInt(100)
            );
            expect(tippingContractERC20BalanceAfter).to.equal(
                tippingContractERC20BalanceBefore
            );
            expect(signer1ERC20BalanceAfter).to.equal(
                signer1ERC20BalanceBefore + mockTokenAmountToSend
            );
        });

        it("Use oracle values when sequencer not supported", async () => {
            const tokenToSend = BigInt("1000000");
            const expectedProtocolFeeOracle = dollarInWei;

            await tippingContract_noOracle.enableChainlinkSupport(
                mockPriceOracle.address,
                ZERO_ADDRESS,
                3600
            );

            const calculatedFee = await tippingContract_noOracle.getPaymentFee(
                tokenToSend,
                AssetType.ERC20,
                signer1Address
            );
            expect(await tippingContract_noOracle.CHECK_SEQUENCER()).to.be
                .false;
            expect(await tippingContract_noOracle.SUPPORTS_CHAINLINK()).to.be
                .true;
            expect(calculatedFee).to.equal(expectedProtocolFeeOracle);

            await tippingContract_noOracle.disableChainlinkSupport();
        });

        it("Fallback values kick in when sequencer is down", async () => {
            const tokenToSend = BigInt("1000000");
            const expectedProtocolFeeOracle = dollarInWei;
            const expectedProtocolFeeFallback = dollarInWeiFallback;

            const calculatedFee1 = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC20,
                signer1Address
            );

            // price before
            expect(calculatedFee1).to.equal(expectedProtocolFeeOracle);

            await mockPriceSequencer.setPrice(1);
            const calculatedFee2 = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC20,
                signer1Address
            );

            // price after
            expect(calculatedFee2).to.equal(expectedProtocolFeeFallback);

            await mockPriceSequencer.setPrice(0);
            const calculatedFee3 = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC20,
                signer1Address
            );

            // price before
            expect(calculatedFee3).to.equal(expectedProtocolFeeOracle);
        });

        it("Fallback values kick in when sequencer's grace period is not over", async () => {
            const tokenToSend = BigInt("1000000");
            const expectedProtocolFeeOracle = dollarInWei;
            const expectedProtocolFeeFallback = dollarInWeiFallback;

            const calculatedFee1 = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC20,
                signer1Address
            );

            // price before
            expect(calculatedFee1).to.equal(expectedProtocolFeeOracle);

            await mockPriceSequencer.setStalenessTimeDelta(3600);
            const calculatedFee2 = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC20,
                signer1Address
            );

            // price after
            expect(calculatedFee2).to.equal(expectedProtocolFeeFallback);

            await mockPriceSequencer.setStalenessTimeDelta(3601);
            const calculatedFee3 = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC20,
                signer1Address
            );

            // price before
            expect(calculatedFee3).to.equal(expectedProtocolFeeOracle);
        });

        it("Fallback values kick in when prices are stale", async () => {
            const tokenToSend = BigInt("1000000");
            const expectedProtocolFeeOracle = dollarInWei;
            const expectedProtocolFeeFallback = dollarInWeiFallback;

            const calculatedFee1 = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC20,
                signer1Address
            );

            // price before
            expect(calculatedFee1).to.equal(expectedProtocolFeeOracle);

            await mockPriceOracle.setStalenessTimeDelta(3601);
            const calculatedFee2 = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC20,
                signer1Address
            );

            // price after
            expect(calculatedFee2).to.equal(expectedProtocolFeeFallback);

            await mockPriceOracle.setStalenessTimeDelta(1000);
            const calculatedFee3 = await tippingContract.getPaymentFee(
                tokenToSend,
                AssetType.ERC20,
                signer1Address
            );

            // price before
            expect(calculatedFee3).to.equal(expectedProtocolFeeOracle);
        });
    });

    describe("More (custom) revert errors", () => {
        it("reverts when trying to send unsupported assetType in batch", async () => {
            const weiToSend = BigInt("1000000");

            const batchObject1 = {
                assetType: 5, // unsupported asset type
                recipient: signer1Address,
                amount: weiToSend,
                tokenId: 0,
                tokenAddress: ZERO_ADDRESS,
                message: "",
            };

            await expect(
                tippingContract.batchSendTo([batchObject1], {
                    value: dollarInWei,
                })
            ).to.be.revertedWithoutReason(); // Hardhat can't find reason, test for l.367 in Tipping.sol
        });
        it("reverts when minimal fee change is wrong", async () => {
            await expect(
                tippingContract.changeMinimalPaymentFee(0, 1, {})
            ).to.be.revertedWithCustomError(
                tippingContract,
                "PaymentFeeTooSmall"
            );

            await expect(
                tippingContract.changeMinimalPaymentFee(1, 0, {})
            ).to.be.revertedWithCustomError(
                tippingContract,
                "DenominatorTooSmall"
            );
            await expect(
                tippingContract.changeMinimalPaymentFee(25, 5, {})
            ).to.be.revertedWithCustomError(
                tippingContract,
                "MinimalFeeTooBig"
            );
        });
        it("reverts when percentage fee change is wrong", async () => {
            await expect(
                tippingContract.changePaymentFeePercentage(0, 100, {})
            ).to.be.revertedWithCustomError(
                tippingContract,
                "PercentageFeeTooSmall"
            );

            await expect(
                tippingContract.changePaymentFeePercentage(5, 0, {})
            ).to.be.revertedWithCustomError(
                tippingContract,
                "DenominatorTooSmall"
            );

            await expect(
                tippingContract.changePaymentFeePercentage(50, 1000, {})
            ).to.be.revertedWithCustomError(
                tippingContract,
                "MinimalFeePercentageTooBig"
            );
        });
        it("reverts when invalid aggregator address is provided", async () => {
            await expect(
                tippingContract.enableChainlinkSupport(
                    ZERO_ADDRESS,
                    ZERO_ADDRESS,
                    0,
                    {}
                )
            ).to.be.revertedWithCustomError(
                tippingContract,
                "InvalidAggregator"
            );
        });
        it("reverts when invalid aggregator address is provided", async () => {
            await expect(
                tippingContract.enableEASSupport(ZERO_ADDRESS, schema, {})
            ).to.be.revertedWithCustomError(tippingContract, "InvalidEAS");
        });
        it("reverts when sending native currency with supported ERC20", async () => {
            const tokenToSend = BigInt("1000000");
            await tippingContract.addSupportedERC20(mockToken2.address);

            await mockToken2.increaseAllowance(
                tippingContract.address,
                tokenToSend
            );
            await expect(
                tippingContract.sendERC20To(
                    signer1Address,
                    tokenToSend,
                    mockToken2.address,
                    "",
                    {value: 100000}
                )
            ).to.be.revertedWithCustomError(
                tippingContract,
                "PayingWithNative"
            );
            await tippingContract.deleteSupportedERC20(mockToken2.address);
        });
        it("reverts when calculating payment fee for unsupported assetType", async () => {
            await expect(
                tippingContract.getPaymentFee(
                    BigInt("1"),
                    5, //unsupported assetType
                    signer1Address
                )
            ).to.be.revertedWithoutReason(); // hardhat can't find reason, test for l166 in FeeCalculator.sol
        });
    });

    describe("Reentrancy attack", () => {
        it("Properly reverts reentrancy attack", async () => {
            const mockAttackerAddress = await mockAttacker.getAddress();
            await tippingContract.addPublicGood(
                await mockAttacker.getAddress()
            );
            await tippingContract.transferOwnership(mockAttackerAddress);
            await owner.sendTransaction({
                to: mockAttackerAddress,
                value: 100000,
            });
            for (let i = 0; i < 4; i++) {
                await mockAttacker.setFunctionToAttack(i + 1);

                await expect(mockAttacker.attack()).to.be.reverted;
            }
        });
    });
});
