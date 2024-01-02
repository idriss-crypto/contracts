import { ethers, waffle } from 'hardhat'
import { BigNumber, BigNumberish, Signer } from 'ethers'
import chai, { expect } from 'chai'
import {
    Tipping,
    MockNFT,
    MockToken,
    MaticPriceAggregatorV3Mock,
    MockERC1155
} from '../src/types'
import MaticPriceAggregatorV3MockArtifact from '../src/artifacts/src/contracts/mocks/MaticPriceAggregatorV3Mock.sol/MaticPriceAggregatorV3Mock.json'
import TippingArtifact from '../src/artifacts/src/contracts/Tipping.sol/Tipping.json'
import MockNFTArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockNFT.json'
import MockERC1155Artifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockERC1155.json'
import MockTokenArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockToken.json'
import chaiAsPromised from 'chai-as-promised'
import { MockProvider, solidity } from 'ethereum-waffle'

import {before, beforeEach} from "mocha";
import {Interface} from "ethers/lib/utils";

chai.use(solidity) // solidity matchers, e.g. expect().to.be.revertedWith("message")
chai.use(chaiAsPromised) //eventually

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const NFT_ID_ARRAY = [... Array(10).keys()]
const ERC1155_ARRAY = [
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 60],
    [4, 1_000_000],
    [5, 996]
]

describe('Tipping contract', async () => {
    let owner: Signer;
    let signer1: Signer;
    let signer2: Signer;
    let signer3: Signer;
    let ownerAddress: string;
    let signer1Address: string;
    let signer2Address: string;
    let signer3Address: string;
    let mockToken: MockToken
    let mockToken2: MockToken
    let mockNFT: MockNFT
    let mockNFT2: MockNFT
    let mockERC1155: MockERC1155
    let mockERC1155_2: MockERC1155
    let mockPriceOracle: MaticPriceAggregatorV3Mock
    let tippingContract: Tipping
    let provider: MockProvider
    let dollarInWei: BigNumber
    let tippingInterface: Interface
    let PAYMENT_FEE_PERCENTAGE_DENOMINATOR: int
    let PAYMENT_FEE_PERCENTAGE: int

    const sendERC20ToBytes = (to: string, amount: BigNumberish,
                              assetContractAddress = ZERO_ADDRESS,
                              message = ''): string => {
        return tippingInterface.encodeFunctionData('sendERC20To',
            [to, amount, assetContractAddress, message])
    }

    const sendERC721ToBytes = (to: string, assetId = 0,
                               assetContractAddress = ZERO_ADDRESS,
                               message = ''): string => {
        return tippingInterface.encodeFunctionData('sendERC721To',
            [to, assetId, assetContractAddress, message])
    }

    const sendERC1155ToBytes = (to: string, assetId = 0, amount: BigNumberish,
                                assetContractAddress = ZERO_ADDRESS,
                                message = ''): string => {
        return tippingInterface.encodeFunctionData('sendERC1155To',
            [to, assetId, amount, assetContractAddress, message])
    }

    const sendNativeToBytes = (to: string, amount: BigNumberish, message = ''): string => {
        return tippingInterface.encodeFunctionData('sendNativeTo',
            [to, amount, message])
    }

    const setupToken = async () => {
        mockToken = (await waffle.deployContract(owner, MockTokenArtifact, [])) as MockToken
        mockToken2 = (await waffle.deployContract(owner, MockTokenArtifact, [])) as MockToken
    }

    const setupERC721 = async () => {
        mockNFT = (await waffle.deployContract(owner, MockNFTArtifact, [])) as MockNFT
        mockNFT2 = (await waffle.deployContract(owner, MockNFTArtifact, [])) as MockNFT

        await Promise.all(
            NFT_ID_ARRAY.map( async (val, idx, _) => {
                await mockNFT.safeMint(ownerAddress, val).catch(_ => {})
                return mockNFT2.safeMint(ownerAddress, val).catch(_ => {})
            })
        )
    }

    const setupERC1155 = async () => {
        mockERC1155 = (await waffle.deployContract(owner, MockERC1155Artifact, [])) as MockERC1155
        mockERC1155_2 = (await waffle.deployContract(owner, MockERC1155Artifact, [])) as MockERC1155

        await Promise.all(
            ERC1155_ARRAY.map( async (val, idx, _) => {
                await mockERC1155.mint(ownerAddress, val[0],  val[1]).catch(_ => {})
                return mockERC1155_2.mint(ownerAddress, val[0],  val[1]).catch(_ => {})
            })
        )
    }

    before(async () => {
        provider = new MockProvider({ ganacheOptions: { gasLimit: 100000000 } })
        owner = provider.getSigner(0)
        signer1 = provider.getSigner(1)
        signer2 = provider.getSigner(2)
        signer3 = provider.getSigner(3)
        ownerAddress = await owner.getAddress()
        signer1Address = await signer1.getAddress()
        signer2Address = await signer2.getAddress()
        signer3Address = await signer3.getAddress()
        mockPriceOracle = (await waffle.deployContract(owner, MaticPriceAggregatorV3MockArtifact, [])) as MaticPriceAggregatorV3Mock
        tippingContract = (await waffle.deployContract(owner, TippingArtifact, [mockPriceOracle.address])) as Tipping
        dollarInWei = await mockPriceOracle.dollarToWei()
        PAYMENT_FEE_PERCENTAGE = 10;
        PAYMENT_FEE_PERCENTAGE_DENOMINATOR = 1000;


        tippingInterface = new ethers.utils.Interface(TippingArtifact.abi);
    })

    describe('Contract management', async () => {
        it('properly adds admin', async () => {
            expect(await tippingContract.admins(ownerAddress)).to.be.true
            expect(await tippingContract.admins(signer1Address)).to.be.false
            expect(await tippingContract.admins(signer2Address)).to.be.false

            await tippingContract.addAdmin(signer1Address)
            await tippingContract.addAdmin(signer2Address)

            expect(await tippingContract.admins(ownerAddress)).to.be.true
            expect(await tippingContract.admins(signer1Address)).to.be.true
            expect(await tippingContract.admins(signer2Address)).to.be.true
        })

        it('properly removes admin', async () => {
            await tippingContract.addAdmin(signer1Address)
            await tippingContract.addAdmin(signer2Address)

            expect(await tippingContract.admins(signer1Address)).to.be.true
            expect(await tippingContract.admins(signer2Address)).to.be.true

            await tippingContract.deleteAdmin(signer1Address)
            await tippingContract.deleteAdmin(signer2Address)

            expect(await tippingContract.admins(signer1Address)).to.be.false
            expect(await tippingContract.admins(signer2Address)).to.be.false
        })

        it('properly adds and deletes supported ERC20', async () => {
            expect(await tippingContract.supportedERC20(mockToken2.address)).to.be.false

            await tippingContract.addSupportedERC20(mockToken2.address)

            expect(await tippingContract.supportedERC20(mockToken2.address)).to.be.true

            await tippingContract.deleteSupportedERC20(mockToken2.address)

            expect(await tippingContract.supportedERC20(mockToken2.address)).to.be.false
        })

        it('properly adds and deletes public good address', async () => {
            expect(await tippingContract.publicGoods(signer1Address)).to.be.false

            await tippingContract.addPublicGood(signer1Address)

            expect(await tippingContract.publicGoods(signer1Address)).to.be.true

            await tippingContract.deletePublicGood(signer1Address)

            expect(await tippingContract.publicGoods(signer1Address)).to.be.false
        })

        it('allows only admin to retrieve funds', async () => {
            expect(await tippingContract.admins(ownerAddress)).to.be.true
            expect(await tippingContract.admins(signer1Address)).to.be.false

            await expect(tippingContract.connect(signer1).withdraw()) .to.be.reverted
            await expect(tippingContract.connect(signer1).withdrawToken(ZERO_ADDRESS)) .to.be.reverted
            await expect(tippingContract.withdraw()) .to.not.be.reverted

            mockToken = (await waffle.deployContract(owner, MockTokenArtifact, [])) as MockToken
            await mockToken.increaseAllowance(tippingContract.address, 1_000_000)
            await tippingContract.sendERC20To(signer1Address, 1_000_000, mockToken.address, "")

            await expect(tippingContract.withdrawToken(mockToken.address)).to.not.be.reverted
        })

        it('allows only owner to change owner', async () => {
            await expect(tippingContract.connect(signer1).transferOwnership(signer1Address))
                .to.be.revertedWith("Ownable: caller is not the owner")

            await expect(tippingContract.transferOwnership(signer1Address)).to.not.be.reverted

            await tippingContract.connect(signer1).transferOwnership(ownerAddress)
        })

        it('allows only owner to change admin roles', async () => {
            await expect(tippingContract.connect(signer1).addAdmin(signer2Address)).to.be.revertedWith("Ownable: caller is not the owner")
            await expect(tippingContract.connect(signer1).deleteAdmin(signer2Address)).to.be.revertedWith("Ownable: caller is not the owner")
        })

        it('fails when trying to renounce contract ownership', async () => {
            await expect(tippingContract.renounceOwnership()).to.be.revertedWith("")
        })
    })

    describe('Send native currency', () => {
        it('correctly calculates percentage fee', async () => {
            // Fee is on top in the new design:
            // recipient gets x amount -> need to send x+1% -> protocol takes that 1% that was put on top (not 1% of amount)
            // protocol forwards x. Here x+1% = weiToSend
            const weiToSend = 1_000_000
            const expectedProtocolFee = weiToSend - (weiToSend * PAYMENT_FEE_PERCENTAGE_DENOMINATOR / (PAYMENT_FEE_PERCENTAGE_DENOMINATOR + PAYMENT_FEE_PERCENTAGE))
            const calculatedFee = await tippingContract.getPaymentFee(weiToSend.sub(expectedProtocolFee), AssetType.Native, signer1Address)
            expect(calculatedFee).to.equal(expectedProtocolFee)
        })
        it('allows for sending native currency', async () => {
            const weiToReceive = 1_000_000
            const calculatedFee = await tippingContract.getPaymentFee(weiToSend, AssetType.Native, signer1Address)
            const weiToSend = weiToReceive + calculatedFee

            const tippingContractBalanceBefore = await provider.getBalance(tippingContract.address)
            const signer1BalanceBefore = await provider.getBalance(signer1Address)

            await tippingContract.sendNativeTo(signer1Address, 0, "", { value: weiToSend })
            const tippingContractBalanceAfter = await provider.getBalance(tippingContract.address)
            const signer1BalanceAfter = await provider.getBalance(signer1Address)
            expect(tippingContractBalanceAfter).to.equal(tippingContractBalanceBefore.add(calculatedFee))
            expect(signer1BalanceAfter).to.equal(signer1BalanceBefore.add(weiToReceive))

            // Do not take a fee if the recipient is a public good
            await tippingContract.addPublicGood(signer2Address)
            const signer2BalanceBefore = await provider.getBalance(signer2Address)
            await tippingContract.sendNativeTo(signer2Address, 0, "", { value: weiToReceive })
            const tippingContractBalanceAfter2 = await provider.getBalance(tippingContract.address)
            const signer2BalanceAfter = await provider.getBalance(signer2Address)
            expect(tippingContractBalanceAfter2).to.equal(tippingContractBalanceAfter)
            expect(signer2BalanceAfter).to.equal(signer2BalanceBefore.add(weiToReceive))
            await tippingContract.deletePublicGood(signer2Address)
        })

        it('allows sending asset to other address as batch', async () => {
            const weiToReceive1 = 1_000_000
            const weiToReceive2 = 2_500_000
            const tippingContractBalanceBefore = await provider.getBalance(tippingContract.address)
            const sig1BalanceBefore = await provider.getBalance(signer1Address)
            const sig2BalanceBefore = await provider.getBalance(signer2Address)

            batchObject1 = {
                assetType: AssetType.Native,
                recipient: signer1Address,
                amount: weiToReceive1,
                tokenId: 0,
                tokenAddress: ZERO_ADDRESS,
                message: ""
            }
            batchObject2 = {
                assetType: AssetType.Native,
                recipient: signer2Address,
                amount: weiToReceive2,
                tokenId: 0,
                tokenAddress: ZERO_ADDRESS,
                message: ""
            }

            const batchSendObject = await tippingContract.calculateBatchFee([batchObject1, batchObject2]);
            const nativeAmountToSend = BigNumber.from(0);
            batchSendObject.forEach(call => {
                nativeAmountToSend = nativeAmountToSend.add(BigNumber.from(call.nativeAmount));
            });
            const adjustedBatchSendObject = batchSendObject.map(({ nativeAmount, ...rest }) => rest);

            await tippingContract.batchSendTo(adjustedBatchSendObject, { value: nativeAmountToSend })


            const tippingContractBalanceAfter = await provider.getBalance(tippingContract.address)
            const sig1BalanceAfter = await provider.getBalance(signer1Address)
            const sig2BalanceAfter = await provider.getBalance(signer2Address)

            expect(tippingContractBalanceAfter).to.equal(tippingContractBalanceBefore.add(weiToSend / 100).add(weiToSend2 / 100))
            expect(sig1BalanceAfter).to.equal(sig1BalanceBefore.add(weiToSend - weiToSend / 100))
            expect(sig2BalanceAfter).to.equal(sig2BalanceBefore.add(weiToSend2 - weiToSend2 / 100))
        })

        it('emits an event', async () => {
            const weiToSend = 1_000_000
            await expect(tippingContract.sendNativeTo(signer1Address, 0, "xyz", { value: weiToSend }))
                .to.emit(tippingContract, 'TipMessage')
                .withArgs(signer1Address, "xyz", ownerAddress, ZERO_ADDRESS);
        })
    })

    describe('Send ERC20', () => {
        beforeEach(async () => {
            await setupToken()
        })

        it('allows for sending asset to other address', async () => {
            const tokensToSend = 1_000_000

            await mockToken.increaseAllowance(tippingContract.address, tokensToSend)
            await tippingContract.sendERC20To(signer1Address, tokensToSend, mockToken.address, "")

            expect(await mockToken.balanceOf(signer1Address)).to.equal(tokensToSend - tokensToSend / 100)
            expect(await mockToken.balanceOf(tippingContract.address)).to.equal(tokensToSend / 100)
        })

        it('allows sending asset to other address as batch', async () => {
            const tokensToSend = 1_000_000

            await mockToken.increaseAllowance(tippingContract.address, tokensToSend * 2)
            await tippingContract.batch([
                sendERC20ToBytes(signer1Address, tokensToSend, mockToken.address, ""),
                sendERC20ToBytes(signer2Address, tokensToSend, mockToken.address, "")
            ])

            expect(await mockToken.balanceOf(signer1Address)).to.equal(tokensToSend - tokensToSend / 100)
            expect(await mockToken.balanceOf(signer2Address)).to.equal(tokensToSend - tokensToSend / 100)
            expect(await mockToken.balanceOf(tippingContract.address)).to.equal((tokensToSend / 100) * 2)
        })

        it('properly calculates fee when sending asset', async () => {
            const tokensToSend = 1_000_000
            const ownerBalanceBefore = await mockToken.balanceOf(ownerAddress)
            expect(await mockToken.balanceOf(tippingContract.address)).to.equal(0)
            expect(await mockToken.balanceOf(signer1Address)).to.equal(0)

            await mockToken.increaseAllowance(tippingContract.address, tokensToSend)
            await tippingContract.sendERC20To(signer1Address, tokensToSend, mockToken.address, "")

            const ownerBalanceAfter = await mockToken.balanceOf(ownerAddress)

            expect(ownerBalanceAfter).to.equal(ownerBalanceBefore.sub(tokensToSend))
            expect(await mockToken.balanceOf(tippingContract.address)).to.equal(tokensToSend / 100)
            expect(await mockToken.balanceOf(signer1Address)).to.equal(tokensToSend - tokensToSend / 100)
        })

        it('emits an event', async () => {
            const tokensToSend = 1_000_000
            await mockToken.increaseAllowance(tippingContract.address, tokensToSend)

            await expect(tippingContract.sendERC20To(signer1Address, tokensToSend, mockToken.address, "xyz"))
                .to.emit(tippingContract, 'TipMessage')
                .withArgs(signer1Address, "xyz", ownerAddress, mockToken.address);
        })
    })

    describe('Send ERC721', () => {
        beforeEach(async () => {
            await setupERC721()
        })

        it('properly calculates fee when sending asset', async () => {
            const tokenToSend = 1
            const tippingContractBalanceBefore = await provider.getBalance(tippingContract.address)

            await mockNFT.approve(tippingContract.address, tokenToSend)
            await tippingContract.sendERC721To(signer1Address, tokenToSend, mockNFT.address, "", { value: dollarInWei })

            const tippingContractBalanceAfter = await provider.getBalance(tippingContract.address)
            expect(tippingContractBalanceAfter).to.equal(tippingContractBalanceBefore.add(dollarInWei))
        })

        it('allows for sending asset to other address', async () => {
            const tokenToSend = 1

            await mockNFT.approve(tippingContract.address, tokenToSend)
            await tippingContract.sendERC721To(signer1Address, tokenToSend, mockNFT.address, "", { value: dollarInWei })

            expect(await mockNFT.ownerOf(tokenToSend)).to.equal(signer1Address)
        })

        it('allows for sending asset to other address as batch', async () => {
            const tokenToSend = 2
            const tokenToSend2 = 3

            await mockNFT.approve(tippingContract.address, tokenToSend)
            await mockNFT.approve(tippingContract.address, tokenToSend2)

            await tippingContract.batch([
                sendERC721ToBytes(signer1Address, tokenToSend, mockNFT.address, ""),
                sendERC721ToBytes(signer2Address, tokenToSend2, mockNFT.address, "")
            ], { value: dollarInWei.mul(2) })

            expect(await mockNFT.ownerOf(tokenToSend)).to.equal(signer1Address)
            expect(await mockNFT.ownerOf(tokenToSend2)).to.equal(signer2Address)
        })

        it('reverts when fee is too small', async () => {
            await mockNFT.approve(tippingContract.address, 1)

            await expect(tippingContract.sendERC721To(signer1Address, 1, mockNFT.address, "", { value: dollarInWei.div(2) }))
                .to.be.revertedWith('Value sent is smaller than minimal fee.')
        })

        it('emits an event', async () => {
            await mockNFT.approve(tippingContract.address, 1)
            await expect(tippingContract.sendERC721To(signer1Address, 1, mockNFT.address, "xyz", { value: dollarInWei }))
                .to.emit(tippingContract, 'TipMessage')
                .withArgs(signer1Address, "xyz", ownerAddress, mockNFT.address);
        })
    })

    describe('Send ERC1155', () => {
        beforeEach(async () => {
            await setupERC1155()
        })

        it('properly calculates fee when sending asset', async () => {
            const tokenToSend = 1
            const tippingContractBalanceBefore = await provider.getBalance(tippingContract.address)

            await mockERC1155.setApprovalForAll(tippingContract.address, true)
            await tippingContract.sendERC1155To(signer1Address, tokenToSend, 1, mockERC1155.address, "", { value: dollarInWei })

            const tippingContractBalanceAfter = await provider.getBalance(tippingContract.address)
            expect(tippingContractBalanceAfter).to.equal(tippingContractBalanceBefore.add(dollarInWei))
        })

        it('allows for sending asset to other address', async () => {
            const tokenToSend = 3

            await mockERC1155.setApprovalForAll(tippingContract.address, true)
            await tippingContract.sendERC1155To(signer1Address, tokenToSend, 2, mockERC1155.address, "", { value: dollarInWei })

            expect(await mockERC1155.balanceOf(signer1Address, tokenToSend)).to.be.equal(2)
        })

        it('allows for sending asset to other address as batch', async () => {
            const tokenToSend = 3

            await mockERC1155.setApprovalForAll(tippingContract.address, true)
            await tippingContract.batch([
                sendERC1155ToBytes(signer1Address, tokenToSend, 2, mockERC1155.address, ""),
                sendERC1155ToBytes(signer2Address, tokenToSend, 3, mockERC1155.address, "")
            ], { value: dollarInWei.mul(2) })

            expect(await mockERC1155.balanceOf(signer1Address, tokenToSend)).to.be.equal(2)
            expect(await mockERC1155.balanceOf(signer2Address, tokenToSend)).to.be.equal(3)
        })

        it('reverts when fee is too small', async () => {
            await mockERC1155.setApprovalForAll(tippingContract.address, true)

            await expect(tippingContract.sendERC1155To(signer1Address, 1, 1, mockERC1155.address, "", { value: dollarInWei.div(2) }))
                .to.be.revertedWith('Value sent is smaller than minimal fee.')
        })

        it('emits an event', async () => {
            const amountToSend = 10
            await mockERC1155.setApprovalForAll(tippingContract.address, true)

            await expect(tippingContract.sendERC1155To(signer1Address, 3, amountToSend, mockERC1155.address, "xyz", { value: dollarInWei }))
                .to.emit(tippingContract, 'TipMessage')
                .withArgs(signer1Address, "xyz", ownerAddress, mockERC1155.address);
        })
    })

    describe('Send multiple assets', () => {
        before(async () => {
            await Promise.all([
                setupToken(),
                setupERC721(),
                setupERC1155()
            ])
        })

        it('properly sends multiple assets', async () => {
            const weiToSend = 1_000_000
            const tippingContractBalanceBefore = await provider.getBalance(tippingContract.address)

            await mockToken.increaseAllowance(tippingContract.address, 50)
            await mockNFT.approve(tippingContract.address, 0)
            await mockERC1155.setApprovalForAll(tippingContract.address, true)

            await tippingContract.batch([
                sendNativeToBytes(signer1Address, weiToSend, ""),
                sendERC20ToBytes(signer1Address, 50, mockToken.address, ""),
                sendERC721ToBytes(signer2Address, 0, mockNFT.address, ""),
                sendERC1155ToBytes(signer1Address, 3, 20, mockERC1155.address, ""),
                sendNativeToBytes(signer2Address, weiToSend, "")
            ], { value: dollarInWei.mul(2).add(weiToSend).add(weiToSend) })

            const tippingContractBalanceAfter = await provider.getBalance(tippingContract.address)
            expect(tippingContractBalanceAfter).to.equal(dollarInWei.mul(2).add(tippingContractBalanceBefore).add((weiToSend / 100) * 2))
        })

        it('reverts when trying to send more than msg.value', async () => {
            await mockToken.increaseAllowance(tippingContract.address, 50)

            await expect(tippingContract.batch([
                sendERC20ToBytes(signer1Address, 50, mockToken.address, ""),
                sendNativeToBytes(signer1Address, dollarInWei.mul(2), ""),
            ], { value: dollarInWei })).to.be.revertedWith('Can\'t send more than msg.value')
        })
    })
})
