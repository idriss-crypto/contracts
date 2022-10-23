import { ethers, waffle } from 'hardhat'
import { BigNumber, Signer } from 'ethers'
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

import { negateBigNumber } from './TestUtils'
import {before, beforeEach} from "mocha";

chai.use(solidity) // solidity matchers, e.g. expect().to.be.revertedWith("message")
chai.use(chaiAsPromised) //eventually

const ASSET_TYPE_COIN = 0
const ASSET_TYPE_TOKEN = 1
const ASSET_TYPE_NFT = 2
const ASSET_TYPE_ERC1155 = 3
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

      it('allows only admin to retrieve funds', async () => {
         expect(await tippingContract.admins(ownerAddress)).to.be.true
         expect(await tippingContract.admins(signer1Address)).to.be.false

         await expect(tippingContract.connect(signer1).withdraw()) .to.be.reverted
         await expect(tippingContract.connect(signer1).withdrawToken(ZERO_ADDRESS)) .to.be.reverted
         await expect(tippingContract.withdraw()) .to.not.be.reverted

         mockToken = (await waffle.deployContract(owner, MockTokenArtifact, [])) as MockToken
         await mockToken.increaseAllowance(tippingContract.address, 1_000_000)
         await tippingContract.sendTokenTo(signer1Address, 1_000_000, mockToken.address, "")

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
      it('properly calculates fee when sending native currency', async () => {
         const weiToSend = 1_000_000
         const tippingContractBalanceBefore = await provider.getBalance(tippingContract.address)

         await tippingContract.sendTo(signer1Address, "", { value: weiToSend })

         const tippingContractBalanceAfter = await provider.getBalance(tippingContract.address)
         expect(tippingContractBalanceAfter).to.equal(tippingContractBalanceBefore.add(weiToSend / 100))
      })

      it('allows for sending native currency to other address', async () => {
         const weiToSend = 1_000_000
         const tippingContractBalanceBefore = await provider.getBalance(tippingContract.address)
         const sig1BalanceBefore = await provider.getBalance(signer1Address)

         await tippingContract.sendTo(signer1Address, "", { value: weiToSend })

         const tippingContractBalanceAfter = await provider.getBalance(tippingContract.address)
         const sig1BalanceAfter = await provider.getBalance(signer1Address)

         expect(tippingContractBalanceAfter).to.equal(tippingContractBalanceBefore.add(weiToSend / 100))
         expect(sig1BalanceAfter).to.equal(sig1BalanceBefore.add(weiToSend - weiToSend / 100))
      })
   })

   describe('Send ERC20', () => {
      beforeEach(async () => {
         mockToken = (await waffle.deployContract(owner, MockTokenArtifact, [])) as MockToken
         mockToken2 = (await waffle.deployContract(owner, MockTokenArtifact, [])) as MockToken
      })

      it('allows for sending ERC20 to other address', async () => {
         const tokensToSend = 1_000_000

         await mockToken.increaseAllowance(tippingContract.address, tokensToSend)
         await tippingContract.sendTokenTo(signer1Address, tokensToSend, mockToken.address, "")

         expect(await mockToken.balanceOf(signer1Address)).to.equal(tokensToSend - tokensToSend / 100)
      })

      it('properly calculates fee when sending ERC20', async () => {
         const tokensToSend = 1_000_000
         const ownerBalanceBefore = await mockToken.balanceOf(ownerAddress)
         expect(await mockToken.balanceOf(tippingContract.address)).to.equal(0)
         expect(await mockToken.balanceOf(signer1Address)).to.equal(0)

         await mockToken.increaseAllowance(tippingContract.address, tokensToSend)
         await tippingContract.sendTokenTo(signer1Address, tokensToSend, mockToken.address, "")

         const ownerBalanceAfter = await mockToken.balanceOf(ownerAddress)

         expect(ownerBalanceAfter).to.equal(ownerBalanceBefore.sub(tokensToSend))
         expect(await mockToken.balanceOf(tippingContract.address)).to.equal(tokensToSend / 100)
         expect(await mockToken.balanceOf(signer1Address)).to.equal(tokensToSend - tokensToSend / 100)
      })
   })

   describe('Send ERC721', () => {
      beforeEach(async () => {
         mockNFT = (await waffle.deployContract(owner, MockNFTArtifact, [])) as MockNFT
         mockNFT2 = (await waffle.deployContract(owner, MockNFTArtifact, [])) as MockNFT

         await Promise.all(
             NFT_ID_ARRAY.map( async (val, idx, _) => {
                await mockNFT.safeMint(ownerAddress, val).catch(_ => {})
                return mockNFT2.safeMint(ownerAddress, val).catch(_ => {})
             })
         )
      })

      it('properly calculates fee when sending ERC721', async () => {
      })

      it('allows for sending ERC721 to other address', async () => {
      })
   })

   describe('Send ERC1155', () => {
      beforeEach(async () => {
         mockERC1155 = (await waffle.deployContract(owner, MockERC1155Artifact, [])) as MockERC1155
         mockERC1155_2 = (await waffle.deployContract(owner, MockERC1155Artifact, [])) as MockERC1155

         await Promise.all(
             ERC1155_ARRAY.map( async (val, idx, _) => {
                await mockERC1155.mint(ownerAddress, val[0],  val[1]).catch(_ => {})
                return mockERC1155_2.mint(ownerAddress, val[0],  val[1]).catch(_ => {})
             })
         )
      })

      it('properly calculates fee when sending ERC1155', async () => {
      })

      it('allows for sending ERC1155 to other address', async () => {
      })
   })
})
