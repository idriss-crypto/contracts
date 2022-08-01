import { ethers, waffle } from 'hardhat'
import { BigNumber, Signer } from 'ethers'
import chai, { expect } from 'chai'
import { IDriss, MockNFT, MockToken, SendToHash, SendToHashReentrancyMock, MaticPriceAggregatorV3Mock } from '../src/types'
import IDrissArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/IDriss.json'
import MaticPriceAggregatorV3MockArtifact from '../src/artifacts/src/contracts/mocks/MaticPriceAggregatorV3Mock.sol/MaticPriceAggregatorV3Mock.json'
import MockNFTArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockNFT.json'
import SendToHashReentrancyMockArtifact from '../src/artifacts/src/contracts/mocks/SendToHashReentrancyMock.sol/SendToHashReentrancyMock.json'
import MockTokenArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockToken.json'
import SendToHashArtifact from '../src/artifacts/src/contracts/SendToHash.sol/SendToHash.json'
import chaiAsPromised from 'chai-as-promised'
import { MockProvider, solidity } from 'ethereum-waffle'

import { hashIDriss, hashIDrissWithPass, negateBigNumber } from './TestUtils'

chai.use(solidity) // solidiity matchers, e.g. expect().to.be.revertedWith("message")
chai.use(chaiAsPromised) //eventually

const ASSET_TYPE_COIN = 0
const ASSET_TYPE_TOKEN = 1
const ASSET_TYPE_NFT = 2
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const NFT_ID_ARRAY = [... Array(10).keys()]

describe('SendToHash contract', async () => {
   let owner: Signer;
   let signer1: Signer;
   let signer2: Signer;
   let signer3: Signer;
   let ownerAddress: string;
   let signer1Address: string;
   let signer2Address: string;
   let signer3Address: string;
   let signer1Hash = await hashIDrissWithPass('a', 'pass-a');
   let signer2Hash = await hashIDrissWithPass('b', 'pass-b');
   let signer3Hash = await hashIDrissWithPass('c', 'pass-c');
   let sendToHash: SendToHash
   let idriss: IDriss
   let mockToken: MockToken
   let mockToken2: MockToken
   let mockNFT: MockNFT
   let mockNFT2: MockNFT
   let mockPriceOracle: MaticPriceAggregatorV3Mock
   let provider: MockProvider

   beforeEach(async () => {
      provider = new MockProvider({ ganacheOptions: { gasLimit: 100000000 } })
      owner = provider.getSigner(0)
      signer1 = provider.getSigner(1)
      signer2 = provider.getSigner(2)
      signer3 = provider.getSigner(3)
      ownerAddress = await owner.getAddress()
      signer1Address = await signer1.getAddress()
      signer2Address = await signer2.getAddress()
      signer3Address = await signer3.getAddress()

      mockToken = (await waffle.deployContract(owner, MockTokenArtifact, [])) as MockToken
      mockToken2 = (await waffle.deployContract(owner, MockTokenArtifact, [])) as MockToken
      mockNFT = (await waffle.deployContract(owner, MockNFTArtifact, [])) as MockNFT
      mockNFT2 = (await waffle.deployContract(owner, MockNFTArtifact, [])) as MockNFT
      mockPriceOracle = (await waffle.deployContract(owner, MaticPriceAggregatorV3MockArtifact, [])) as MaticPriceAggregatorV3Mock
      idriss = (await waffle.deployContract(owner, IDrissArtifact, [])) as IDriss
      sendToHash = (await waffle.deployContract(owner, SendToHashArtifact,
         [idriss.address, mockPriceOracle.address])) as SendToHash

      idriss.addIDriss(signer1Hash, signer1Address)
      idriss.addIDriss(signer2Hash, signer2Address)
      idriss.addIDriss(signer3Hash, signer3Address)

      Promise.all(
         NFT_ID_ARRAY.map( async (val, idx, _) => { 
            await mockNFT.safeMint(ownerAddress, val).catch(e => {console.log(e)})
            return mockNFT2.safeMint(ownerAddress, val).catch(e => {console.log(e)})
         })
      )
   })

   it('reverts when trying to perform an reentrancy on an NFT', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      let reentrancyContract = (await waffle.deployContract(owner, SendToHashReentrancyMockArtifact, [sendToHash.address])) as SendToHashReentrancyMock

      await owner.sendTransaction({
         to: reentrancyContract.address,
         value: ethers.utils.parseEther('30.0')
      })
      
      await expect(sendToHash.sendToAnyone(signer1Hash, 5, ASSET_TYPE_NFT, reentrancyContract.address, 1, {value: dollarInWei}))
         .to.be.revertedWith('ReentrancyGuard: reentrant call')

      expect (await reentrancyContract.reentrancyCounter()).to.be.equal(0)
   })

   it('reverts when trying to perform an reentrancy on a token', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      let reentrancyContract = (await waffle.deployContract(owner, SendToHashReentrancyMockArtifact, [sendToHash.address])) as SendToHashReentrancyMock

      await owner.sendTransaction({
         to: reentrancyContract.address,
         value: ethers.utils.parseEther('30.0')
      })
      
      await expect(sendToHash.sendToAnyone(signer1Hash, 5, ASSET_TYPE_TOKEN, reentrancyContract.address, 1, {value: dollarInWei}))
         .to.be.revertedWith('ReentrancyGuard: reentrant call')

      expect (await reentrancyContract.reentrancyCounter()).to.be.equal(0)
   })

   it('properly sets a contract owner', async () => {
      expect(await sendToHash.owner()).to.be.equal(ownerAddress)
   })

   it('properly changes a contract owner', async () => {
      await sendToHash.transferOwnership(signer1Address)

      expect(await sendToHash.owner()).to.be.equal(signer1Address)
      await expect(sendToHash.transferOwnership(ownerAddress))
         .to.be.revertedWith('Ownable: caller is not the owner')
   })

   it('reverts when trying to renounce ownership', async () => {
      await expect(sendToHash.renounceOwnership())
         .to.be.revertedWith('Renouncing ownership is not supported')
   })

   it('reverts sendToAnyone() when MATIC value is zero', async () => {
      await expect(sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0))
         .to.be.revertedWith('Value sent is smaller than minimal fee.')
      await expect(sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_TOKEN, ZERO_ADDRESS, 0))
         .to.be.revertedWith('Value sent is smaller than minimal fee.')
      await expect(sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_NFT, ZERO_ADDRESS, 0))
         .to.be.revertedWith('Value sent is smaller than minimal fee.')
   })

   it ('reverts sendToAnyone() when an incorrect asset type is passed', async () => {
      await expect(sendToHash.sendToAnyone(signer1Hash, 0, 5, ZERO_ADDRESS, 0)).to.be.reverted
   })

   it ('reverts sendToAnyone() when asset address is 0', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      
      await expect(sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_TOKEN, ZERO_ADDRESS, 0, {value: dollarInWei}))
         .to.be.revertedWith('Asset address cannot be 0')
      await expect(sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, ZERO_ADDRESS, 0, {value: dollarInWei}))
         .to.be.revertedWith('Asset address cannot be 0')
   })

   it ('reverts sendToAnyone() when assetContractAddress is not an existing contract', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await expect(sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, signer1Address, 0, {value: dollarInWei}))
         .to.be.revertedWith('Asset address is not a contract')
   })

   it ('reverts sendToAnyone() when asset amount is 0', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await expect(sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.be.revertedWith('Asset amount has to be bigger than 0')
      await expect(sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_NFT, mockNFT.address, 0, {value: dollarInWei}))
         .to.be.revertedWith('Asset amount has to be bigger than 0')
   })

   it ('reverts sendToAnyone() when receiver does not have allowance for a token', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockToken.transfer(signer1Address, 5)
      expect(await mockToken.balanceOf(signer1Address)).to.be.equal(5)

      await mockToken.connect(signer1).approve(sendToHash.address, 5)
      expect(await mockToken.allowance(signer1Address, sendToHash.address)).to.be.equal(5)

      await expect(sendToHash.connect(signer1).sendToAnyone(signer2Hash, 10, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.be.revertedWith('ERC20: insufficient allowance')
   })

   it ('reverts sendToAnyone() when sender is not allowed to send an NFT', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await expect(sendToHash.connect(signer1).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei}))
         .to.be.revertedWith('ERC721: transfer caller is not owner nor approved')
   })

   it ('properly handles asset address for MATIC transfer', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const payments = [dollarInWei.add(100), dollarInWei.add(2500), dollarInWei.add(968)]

      expect(await sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, mockToken.address, 0, {value: payments[0]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(payments[0]), payments[0]])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(100)

      expect(await sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, mockNFT.address, 0, {value: payments[1]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(payments[1]), payments[1]])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, mockToken.address)).to.be.equal(100 + 2500)

      expect(await sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: payments[2]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(payments[2]), payments[2]])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, mockNFT.address)).to.be.equal(100 + 2500 + 968)
   })

   it ('properly handles oracle price changes', async () => {
      const decimals = await mockPriceOracle.decimals()
      const oracleDecimals = BigNumber.from(10).pow(decimals)
      const maticPriceMultiplier = BigNumber.from(10).pow(18 + decimals)
      let answer: BigNumber;
      let calculatedDollarInWei: BigNumber;
      const dollarPrices = [
         oracleDecimals.div(2),  // 0,5$
         oracleDecimals.mul(6),  //   6$
         oracleDecimals.div(100),//0,01$
         oracleDecimals.div(10)  // 0,1$
      ];

      let _95Cents = () => {return calculatedDollarInWei.mul(95).div(100)}
      let _94Cents = () => {return calculatedDollarInWei.mul(94).div(100)}
      let _110Cents = () => {return calculatedDollarInWei.mul(110).div(100)}

      for (let price of dollarPrices) {
         await mockPriceOracle.setPrice(price);
         ({ answer } = await mockPriceOracle.latestRoundData())
         let dollarInWei = await mockPriceOracle.dollarToWei()
         calculatedDollarInWei = maticPriceMultiplier.div(answer);

         expect(calculatedDollarInWei).to.be.equal(dollarInWei)

         expect(await sendToHash.sendToAnyone(`a${price.toString()}`, 0, ASSET_TYPE_COIN, mockToken.address, 0, {value: _110Cents()}))
            .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(_110Cents()), _110Cents()]);
         expect(await sendToHash.balanceOf(`a${price.toString()}`, ASSET_TYPE_COIN, ZERO_ADDRESS))
            .to.be.equal(calculatedDollarInWei.div(10))

         await mockToken.approve(sendToHash.address, 5)
         expect(() => sendToHash.sendToAnyone(`a${price.toString()}`, 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: _95Cents()}))
            .to.changeTokenBalances(mockToken, [owner, sendToHash], [-5, 5]);

         await expect(sendToHash.sendToAnyone(`a${price.toString()}`, 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: _94Cents()}))
            .to.be.revertedWith('Value sent is smaller than minimal fee.')

         await expect(sendToHash.sendToAnyone(`a${price.toString()}`, 0, ASSET_TYPE_COIN, mockToken.address, 0, {value: calculatedDollarInWei}))
            .to.be.revertedWith('Transferred value has to be bigger than 0')
      }
   })

   it ('reverts when fee is below 95 cents', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const minimalFee = dollarInWei.mul(93).div(100)

      await mockToken.approve(sendToHash.address, 5)

      await expect(sendToHash.sendToAnyone(signer1Hash, 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: minimalFee}))
         .to.be.revertedWith('Value sent is smaller than minimal fee.')
   })

   it ('properly handles fee on 96 cents', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const minimalFee = dollarInWei.mul(96).div(100)

      await mockToken.approve(sendToHash.address, 5)

      expect(await sendToHash.sendToAnyone(signer1Hash, 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: minimalFee}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(minimalFee), minimalFee])
   })

   it ('properly handles fee on a 1$ transfer', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockToken.approve(sendToHash.address, 5)

      expect(await sendToHash.sendToAnyone(signer1Hash, 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(dollarInWei), dollarInWei])
   })

   it ('properly handles 1% fee for cash transfer', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const valueToTransfer = dollarInWei.mul(250)
      const expectedFee = valueToTransfer.div(100)

      expect(await sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: valueToTransfer}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(valueToTransfer), valueToTransfer])

      const accountBalance = (await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).toString()

      expect(accountBalance).to.be.equal(valueToTransfer.sub(expectedFee).toString())
   })

   it ('properly handles amounts in sendToAnyone() for MATIC transfer', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const minimumAcceptablePayment = dollarInWei.add(1)
      const minimumAcceptablePaymentNegated = negateBigNumber(minimumAcceptablePayment)

      await expect(sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: dollarInWei}))
         .to.be.revertedWith('Transferred value has to be bigger than 0')

      await expect(await sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: minimumAcceptablePayment}))
         .to.changeEtherBalances([owner, sendToHash], [minimumAcceptablePaymentNegated, minimumAcceptablePayment])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(1)
   })

   it ('properly handles amounts in sendToAnyone() for single Token transfer', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockToken.approve(sendToHash.address, 500)
      await mockToken.transfer(signer1Address, 500)
      await mockToken.connect(signer1).approve(sendToHash.address, 300)

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 100, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [-100, 100])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(100)

      await expect(() => sendToHash.sendToAnyone(signer2Hash, 300, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [-300, 300])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(100)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(300)
   })

   it ('properly handles amounts in sendToAnyone() for single NFT transfer', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockNFT.approve(sendToHash.address, 0)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 1)
      await mockNFT.connect(signer1).approve(sendToHash.address, 1)
      await mockNFT.approve(sendToHash.address, 2)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 3)
      await mockNFT.connect(signer1).approve(sendToHash.address, 3)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 4)
      await mockNFT.connect(signer1).approve(sendToHash.address, 4)

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [owner, sendToHash], [-1, 1])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(2)

      await expect(() => sendToHash.sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 2, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [owner, sendToHash], [-1, 1])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 3, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])
      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 4, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(2)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(3)
   })

   it ('properly handles amounts in sendToAnyone() for multiple Token transfer of the same type', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockToken.approve(sendToHash.address, 500)
      await mockToken.transfer(signer1Address, 500)
      await mockToken.connect(signer1).approve(sendToHash.address, 300)

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 100, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [-100, 100])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer1Hash, 250, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [signer1, sendToHash], [-250, 250])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(350)

      await expect(() => sendToHash.sendToAnyone(signer2Hash, 300, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [-300, 300])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 20, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [signer1, sendToHash], [-20, 20])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(350)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(320)
   })

   it ('properly handles assets for multiple asset transfers', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockNFT.approve(sendToHash.address, 0)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 1)
      await mockNFT.connect(signer1).approve(sendToHash.address, 1)
      await mockNFT.approve(sendToHash.address, 2)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 3)
      await mockNFT.connect(signer1).approve(sendToHash.address, 3)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 4)
      await mockNFT.connect(signer1).approve(sendToHash.address, 4)

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [owner, sendToHash], [-1, 1])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(2)

      await expect(() => sendToHash.sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 2, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [owner, sendToHash], [-1, 1])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 3, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])
      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 4, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])

      await mockToken.approve(sendToHash.address, 500)
      await mockToken.transfer(signer1Address, 500)
      await mockToken.connect(signer1).approve(sendToHash.address, 300)

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 100, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [-100, 100])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer1Hash, 250, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [signer1, sendToHash], [-250, 250])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(350)

      await expect(() => sendToHash.sendToAnyone(signer2Hash, 300, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [-300, 300])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 20, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [signer1, sendToHash], [-20, 20])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(350)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(320)
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(2)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(3)
   })

   it ('properly handles assets for multiple asset transfers and reversals', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockNFT.approve(sendToHash.address, 0)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 1)
      await mockNFT.connect(signer1).approve(sendToHash.address, 1)
      await mockNFT.approve(sendToHash.address, 2)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 3)
      await mockNFT.connect(signer1).approve(sendToHash.address, 3)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 4)
      await mockNFT.connect(signer1).approve(sendToHash.address, 4)

      // send NFT
      await expect(() => sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [owner, sendToHash], [-1, 1])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)

      // revert NFT
      await expect(() => sendToHash.revertPayment(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.changeTokenBalances(mockNFT, [owner, sendToHash], [1, -1])
      await expect(() => sendToHash.connect(signer1).revertPayment(signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [1, -1])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(0)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(0)

      await expect(() => sendToHash.sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 2, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [owner, sendToHash], [-1, 1])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 3, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])
      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 4, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])

      // additionally send tokens
      await mockToken.approve(sendToHash.address, 500)
      await mockToken.transfer(signer1Address, 500)
      await mockToken.connect(signer1).approve(sendToHash.address, 300)

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 100, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [-100, 100])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 300, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [signer1, sendToHash], [-300, 300])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(100)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(300)
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(0)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(3)

      await expect(() => sendToHash.revertPayment(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [100, -100])
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(0)

      await expect(() => sendToHash.connect(signer1).revertPayment(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.changeTokenBalances(mockToken, [signer1, sendToHash], [300, -300])
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(0)
   })


   it ('properly handles amounts in sendToAnyone() for multiple Token transfer of many types', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      const initialTokenOwnerBalance = await mockToken.balanceOf(ownerAddress)
      const initialToken2OwnerBalance = await mockToken2.balanceOf(ownerAddress)

      await mockToken.approve(sendToHash.address, 500)
      await mockToken.transfer(signer1Address, 500)
      await mockToken.connect(signer1).approve(sendToHash.address, 700)
      await mockToken.transfer(signer2Address, 500)
      await mockToken.connect(signer2).approve(sendToHash.address, 700)

      await mockToken2.approve(sendToHash.address, 500)
      await mockToken2.transfer(signer1Address, 500)
      await mockToken2.connect(signer1).approve(sendToHash.address, 700)
      await mockToken2.transfer(signer2Address, 500)
      await mockToken2.connect(signer2).approve(sendToHash.address, 700)

      await expect(() => sendToHash.connect(signer2).sendToAnyone(signer1Hash, 100, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [signer2, sendToHash], [-100, 100])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 300, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [signer1, sendToHash], [-300, 300])

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 200, ASSET_TYPE_TOKEN, mockToken2.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken2, [owner, sendToHash], [-200, 200])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 90, ASSET_TYPE_TOKEN, mockToken2.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken2, [signer1, sendToHash], [-90, 90])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(100)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(300)
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken2.address)).to.be.equal(200)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_TOKEN, mockToken2.address)).to.be.equal(90)

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 50, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [-50, 50])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 10, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [signer1, sendToHash], [-10, 10])

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 17, ASSET_TYPE_TOKEN, mockToken2.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken2, [owner, sendToHash], [-17, 17])

      await expect(() => sendToHash.connect(signer2).sendToAnyone(signer2Hash, 33, ASSET_TYPE_TOKEN, mockToken2.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken2, [signer2, sendToHash], [-33, 33])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(150)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(310)
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken2.address)).to.be.equal(217)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_TOKEN, mockToken2.address)).to.be.equal(123)

      expect(await mockToken.balanceOf(ownerAddress)).to.be.equal(initialTokenOwnerBalance.sub(1050))
      expect(await mockToken.balanceOf(signer1Address)).to.be.equal(190)
      expect(await mockToken.balanceOf(signer2Address)).to.be.equal(400)

      expect(await mockToken2.balanceOf(ownerAddress)).to.be.equal(initialToken2OwnerBalance.sub(1217))
      expect(await mockToken2.balanceOf(signer1Address)).to.be.equal(410)
      expect(await mockToken2.balanceOf(signer2Address)).to.be.equal(467)
   })

   it ('properly handles multiple payments from multiple accounts', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      const prices = [
         dollarInWei.add(10000),
         dollarInWei.add(230),
         dollarInWei.add(50),
         dollarInWei.add(17)
      ]

      await expect(() => sendToHash.connect(signer2).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[0]}))
         .to.changeEtherBalances([signer2, sendToHash], [negateBigNumber(prices[0]), prices[0]])

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, mockToken2.address, 0, {value: prices[1]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(prices[1]), prices[1]])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, mockToken.address)).to.be.equal(10230)
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, mockToken2.address)).to.be.equal(10230)

      await expect(() => sendToHash.connect(signer3).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[2]}))
         .to.changeEtherBalances([signer3, sendToHash], [negateBigNumber(prices[2]), prices[2]])

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, mockToken2.address, 0, {value: prices[3]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(prices[3]), prices[3]])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, mockToken.address)).to.be.equal(10297)
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, mockToken2.address)).to.be.equal(10297)

      await expect(() => sendToHash.revertPayment(signer1Hash, ASSET_TYPE_COIN, mockToken2.address))
         .to.changeEtherBalances([owner, sendToHash], [247, -247])
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(10050)

      await expect(() => sendToHash.connect(signer2).revertPayment(signer1Hash, ASSET_TYPE_COIN, mockToken2.address))
         .to.changeEtherBalances([signer2, sendToHash], [10000, -10000])
      expect(await sendToHash.connect(signer2).balanceOf(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(50)

      await expect(() => sendToHash.connect(signer3).revertPayment(signer1Hash, ASSET_TYPE_COIN, mockToken2.address))
         .to.changeEtherBalances([signer3, sendToHash], [50, -50])
      expect(await sendToHash.connect(signer3).balanceOf(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(0)
   })

   it ('properly handles multiple payments from one account', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      const totalPaymentsValue = 234000 + 850 + 9999 + 333334
      const prices = [
         dollarInWei.add(234000),
         dollarInWei.add(850),
         dollarInWei.add(9999),
         dollarInWei.add(333334)
      ]

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[0]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(prices[0]), prices[0]])

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, mockToken2.address, 0, {value: prices[1]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(prices[1]), prices[1]])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, mockToken.address)).to.be.equal(234000 + 850)

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[2]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(prices[2]), prices[2]])

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, mockToken2.address, 0, {value: prices[3]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(prices[3]), prices[3]])
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, mockToken2.address)).to.be.equal(totalPaymentsValue)

      await expect(() => sendToHash.revertPayment(signer1Hash, ASSET_TYPE_COIN, mockToken2.address))
         .to.changeEtherBalances([owner, sendToHash], [totalPaymentsValue, -totalPaymentsValue])
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(0)
   })

   it ('properly handles amounts in sendToAnyone() for multiple NFT transfer of many types', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockNFT.approve(sendToHash.address, 0)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 1)
      await mockNFT.connect(signer1).approve(sendToHash.address, 1)
      await mockNFT.approve(sendToHash.address, 2)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 3)
      await mockNFT.connect(signer1).approve(sendToHash.address, 3)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 4)
      await mockNFT.connect(signer1).approve(sendToHash.address, 4)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 5)

      await mockNFT2.approve(sendToHash.address, 5)
      await mockNFT2.transferFrom(ownerAddress, signer1Address, 6)
      await mockNFT2.connect(signer1).approve(sendToHash.address, 6)
      await mockNFT2.approve(sendToHash.address, 7)
      await mockNFT2.transferFrom(ownerAddress, signer1Address, 8)
      await mockNFT2.connect(signer1).approve(sendToHash.address, 8)
      await mockNFT2.transferFrom(ownerAddress, signer1Address, 9)
      await mockNFT2.connect(signer1).approve(sendToHash.address, 9)

      // send NFT
      await expect(() => sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [owner, sendToHash], [-1, 1])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT2.address, 5, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT2, [owner, sendToHash], [-1, 1])

      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT2.address, 6, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT2, [signer1, sendToHash], [-1, 1])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT2.address)).to.be.equal(2)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_NFT, mockNFT2.address)).to.be.equal(0)

      // revert NFT
      await expect(() => sendToHash.revertPayment(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.changeTokenBalances(mockNFT, [owner, sendToHash], [1, -1])
      await expect(() => sendToHash.connect(signer1).revertPayment(signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [1, -1])
      await expect(() => sendToHash.revertPayment(signer1Hash, ASSET_TYPE_NFT, mockNFT2.address))
         .to.changeTokenBalances(mockNFT2, [owner, sendToHash], [1, -1])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT2.address)).to.be.equal(1)
      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_NFT, mockNFT2.address)).to.be.equal(0)

      await expect(() => sendToHash.sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 2, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [owner, sendToHash], [-1, 1])
      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 3, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])
      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 4, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])
   })

   it ('allows transfering all fees earned by the contract to the owner', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const payment = dollarInWei.add(2340000)
      const fees = [
         dollarInWei.mul(96).div(100),
         dollarInWei.mul(99).div(100),
         dollarInWei.mul(98).div(100),
         dollarInWei.mul(97).div(100),
      ]

      let currentFees: BigNumber

      await mockToken.approve(sendToHash.address, 50)
      await mockToken.transfer(signer1Address, 100)
      await mockToken.connect(signer1).approve(sendToHash.address, 50)
      await mockNFT.approve(sendToHash.address, 1)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 3)
      await mockNFT.connect(signer1).approve(sendToHash.address, 3)

      currentFees = fees[0]
      await expect(() => sendToHash.sendToAnyone(signer1Hash, 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: fees[0]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(fees[0]), fees[0]])
      expect(await sendToHash.paymentFeesBalance()).to.be.equal(currentFees)

      currentFees = currentFees.add(fees[1])
      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer1Hash, 23, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: fees[1]}))
         .to.changeEtherBalances([signer1, sendToHash], [negateBigNumber(fees[1]), fees[1]])
      expect(await sendToHash.paymentFeesBalance()).to.be.equal(currentFees)

      currentFees = currentFees.add(fees[2])
      await expect(() => sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, {value: fees[2]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(fees[2]), fees[2]])
      expect(await sendToHash.paymentFeesBalance()).to.be.equal(currentFees)

      currentFees = currentFees.add(fees[3])
      await expect(() => sendToHash.connect(signer1).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 3, {value: fees[3]}))
         .to.changeEtherBalances([signer1, sendToHash], [negateBigNumber(fees[3]), fees[3]])
      expect(await sendToHash.paymentFeesBalance()).to.be.equal(currentFees)

      currentFees = currentFees.add(dollarInWei)
      await expect(() => sendToHash.sendToAnyone('r', 1, ASSET_TYPE_COIN, ZERO_ADDRESS, 1, {value: payment}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(payment), payment])
      expect(await sendToHash.paymentFeesBalance()).to.be.equal(currentFees)

      await expect(() => sendToHash.claimPaymentFees())
         .to.changeEtherBalances([owner, sendToHash], [currentFees, negateBigNumber(currentFees)])
   })

   it ('reverts when non owner tries to transfer fees earned by the contract', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const payment = dollarInWei.add(10000)

      expect(await sendToHash.sendToAnyone('r', 1, ASSET_TYPE_COIN, ZERO_ADDRESS, 1, {value: payment}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(payment), payment])

      await expect(sendToHash.connect(signer1).claimPaymentFees())
         .to.be.revertedWith('Ownable: caller is not the owner')
   })

   it ('properly handles adding and reverting/claiming the same NFT over and over again', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      for (let i = 0; i < 10; i++) {
         await mockNFT.approve(sendToHash.address, 1)

         await expect(() => sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei}))
            .to.changeTokenBalances(mockNFT, [owner, sendToHash], [-1, 1])

         expect(await mockNFT.ownerOf(1)).to.be.equal(sendToHash.address)

         await expect(() => sendToHash.revertPayment(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
            .to.changeTokenBalances(mockNFT, [owner, sendToHash], [1, -1])

         expect(await mockNFT.ownerOf(1)).to.be.equal(ownerAddress)

         await mockNFT.approve(sendToHash.address, 1)

         await expect(() => sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei}))
            .to.changeTokenBalances(mockNFT, [owner, sendToHash], [-1, 1])

         expect(await mockNFT.ownerOf(1)).to.be.equal(sendToHash.address)
         expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
         expect(await idriss.getIDriss(signer1Hash)).to.be.equal(signer1Address)
         await expect(() => sendToHash.connect(signer1).claim(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
            .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [1, -1])

         expect(await mockNFT.ownerOf(1)).to.be.equal(signer1Address)

         await mockNFT.connect(signer1).transferFrom(signer1Address, ownerAddress, 1)
      }
   })

   it ('properly handles adding and reverting/claiming the same token over and over again', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      for (let i = 0; i < 10; i++) {
         await mockToken.approve(sendToHash.address, 50)

         await expect(() => sendToHash.sendToAnyone(signer1Hash, 50, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
            .to.changeTokenBalances(mockToken, [owner, sendToHash], [-50, 50])

         expect(await mockToken.balanceOf(sendToHash.address)).to.be.equal(50)

         await expect(() => sendToHash.revertPayment(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
            .to.changeTokenBalances(mockToken, [owner, sendToHash], [50, -50])

         expect(await mockToken.balanceOf(sendToHash.address)).to.be.equal(0)

         await mockToken.approve(sendToHash.address, 150)

         await expect(() => sendToHash.sendToAnyone(signer1Hash, 150, ASSET_TYPE_TOKEN, mockToken.address, 1, {value: dollarInWei}))
            .to.changeTokenBalances(mockToken, [owner, sendToHash], [-150, 150])

         expect(await mockToken.balanceOf(sendToHash.address)).to.be.equal(150)
         expect(await idriss.getIDriss(signer1Hash)).to.be.equal(signer1Address)
         await expect(() => sendToHash.connect(signer1).claim(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
            .to.changeTokenBalances(mockToken, [signer1, sendToHash], [150, -150])

         expect(await mockToken.balanceOf(sendToHash.address)).to.be.equal(0)
         expect(await mockToken.balanceOf(signer1Address)).to.be.equal(150)

         await mockToken.connect(signer1).transfer(ownerAddress, 150)
      }
   })

   it ('reverts moveAssetToOtherHash() when there is nothing to revert', async () => {
      await expect(sendToHash.connect(signer1).moveAssetToOtherHash(signer1Hash, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
          .to.be.revertedWith('Nothing to revert.')
      await expect(sendToHash.connect(signer1).moveAssetToOtherHash(signer1Hash, signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
          .to.be.revertedWith('Nothing to revert.')
      await expect(sendToHash.connect(signer1).moveAssetToOtherHash(signer1Hash, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
          .to.be.revertedWith('Nothing to revert.')
   })

   it ('performs moveAssetToOtherHash() for native currency', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await sendToHash.sendToAnyone(signer1Hash, 150, ASSET_TYPE_COIN, mockToken.address, 0, {value: dollarInWei.add(1345)})
      await sendToHash.moveAssetToOtherHash(signer1Hash, signer3Hash, ASSET_TYPE_COIN, mockToken.address)

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(0)
      expect(await sendToHash.balanceOf(signer3Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(1345)
   })

   it ('performs moveAssetToOtherHash() for a token', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockToken.approve(sendToHash.address, 150)

      await sendToHash.sendToAnyone(signer1Hash, 150, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHash.moveAssetToOtherHash(signer1Hash, signer3Hash, ASSET_TYPE_TOKEN, mockToken.address)

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(0)
      expect(await sendToHash.balanceOf(signer3Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(150)
   })

   it ('performs moveAssetToOtherHash() for an NFT', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockNFT.approve(sendToHash.address, 1)

      await sendToHash.sendToAnyone(signer1Hash, 150, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei})
      await sendToHash.moveAssetToOtherHash(signer1Hash, signer3Hash, ASSET_TYPE_NFT, mockNFT.address)

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(0)
      expect(await sendToHash.balanceOf(signer3Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
   })


   it ('allows user to claim native currency from new hash after moveAssetToOtherHash()', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await sendToHash.sendToAnyone(signer1Hash, 150, ASSET_TYPE_COIN, mockToken.address, 0, {value: dollarInWei.add(1345)})
      await sendToHash.moveAssetToOtherHash(signer1Hash, signer3Hash, ASSET_TYPE_COIN, mockToken.address)

      await expect(() => sendToHash.connect(signer3).claim(signer3Hash, ASSET_TYPE_COIN, mockToken.address))
          .to.changeEtherBalances( [signer3, sendToHash], [1345, -1345])
   })

   it ('allows user to claim NFTs from new hash after moveAssetToOtherHash()', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockNFT.approve(sendToHash.address, 1)
      await sendToHash.sendToAnyone(signer1Hash, 150, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei})
      await sendToHash.moveAssetToOtherHash(signer1Hash, signer2Hash, ASSET_TYPE_NFT, mockNFT.address)

      await expect(() => sendToHash.connect(signer2).claim(signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
          .to.changeTokenBalances(mockNFT, [signer2, sendToHash], [1, -1])
   })

   it ('allows user to claim tokens from new hash after moveAssetToOtherHash()', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockToken.approve(sendToHash.address, 150)
      await sendToHash.sendToAnyone(signer1Hash, 150, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHash.moveAssetToOtherHash(signer1Hash, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)

      await expect(() => sendToHash.connect(signer2).claim(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
          .to.changeTokenBalances(mockToken, [signer2, sendToHash], [150, -150])
   })

   it ('properly handles moving native coins multiple times in moveAssetToOtherHash()', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await sendToHash.sendToAnyone(signer1Hash, 50, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: dollarInWei.add(1000)})
      await sendToHash.moveAssetToOtherHash(signer1Hash, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)
      await sendToHash.moveAssetToOtherHash(signer2Hash, signer3Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)
      await sendToHash.moveAssetToOtherHash(signer3Hash, 'd', ASSET_TYPE_COIN, ZERO_ADDRESS)
      await sendToHash.moveAssetToOtherHash('d', signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)
      await sendToHash.moveAssetToOtherHash(signer1Hash, 'd', ASSET_TYPE_COIN, ZERO_ADDRESS)

      expect(await sendToHash.balanceOf('d', ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(1000)
   })

   it ('properly handles moving NFTs multiple times in moveAssetToOtherHash()', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockNFT.approve(sendToHash.address, 0)

      await sendToHash.sendToAnyone(signer1Hash, 50, ASSET_TYPE_NFT, mockNFT.address, 0, {value: dollarInWei})
      await sendToHash.moveAssetToOtherHash(signer1Hash, signer2Hash, ASSET_TYPE_NFT, mockNFT.address)
      await sendToHash.moveAssetToOtherHash(signer2Hash, signer3Hash, ASSET_TYPE_NFT, mockNFT.address)
      await sendToHash.moveAssetToOtherHash(signer3Hash, 'd', ASSET_TYPE_NFT, mockNFT.address)
      await sendToHash.moveAssetToOtherHash('d', signer1Hash, ASSET_TYPE_NFT, mockNFT.address)
      await sendToHash.moveAssetToOtherHash(signer1Hash, 'd', ASSET_TYPE_NFT, mockNFT.address)

      expect(await sendToHash.balanceOf('d', ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
      expect(await mockNFT.balanceOf(sendToHash.address)).to.be.equal(1)
   })

   it ('properly handles moving multiple NFTs in moveAssetToOtherHash()', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockNFT.approve(sendToHash.address, 0)
      await mockNFT.approve(sendToHash.address, 1)
      await mockNFT.approve(sendToHash.address, 2)

      await sendToHash.sendToAnyone(signer1Hash, 2, ASSET_TYPE_NFT, mockNFT.address, 0, {value: dollarInWei})
      await sendToHash.sendToAnyone(signer1Hash, 2, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei})
      await sendToHash.sendToAnyone(signer1Hash, 2, ASSET_TYPE_NFT, mockNFT.address, 2, {value: dollarInWei})
      await sendToHash.moveAssetToOtherHash(signer1Hash, signer2Hash, ASSET_TYPE_NFT, mockNFT.address)

      expect(await sendToHash.balanceOf(signer2Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(3)
      expect(await mockNFT.balanceOf(sendToHash.address)).to.be.equal(3)

      await expect(() => sendToHash.connect(signer2).claim(signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
          .to.changeTokenBalances(mockNFT, [signer2, sendToHash], [3, -3])
   })

   it ('properly handles moving tokens multiple times in moveAssetToOtherHash()', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockToken.approve(sendToHash.address, 50)

      await sendToHash.sendToAnyone(signer1Hash, 50, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHash.moveAssetToOtherHash(signer1Hash, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)
      await sendToHash.moveAssetToOtherHash(signer2Hash, signer3Hash, ASSET_TYPE_TOKEN, mockToken.address)
      await sendToHash.moveAssetToOtherHash(signer3Hash, 'd', ASSET_TYPE_TOKEN, mockToken.address)
      await sendToHash.moveAssetToOtherHash('d', signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)
      await sendToHash.moveAssetToOtherHash(signer1Hash, 'd', ASSET_TYPE_TOKEN, mockToken.address)

      expect(await sendToHash.balanceOf('d', ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(50)
      expect(await mockToken.balanceOf(sendToHash.address)).to.be.equal(50)
   })

   it ('reverts when old IDriss hash owner tries to revert funds after moveAssetToOtherHash()', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockToken.approve(sendToHash.address, 50)
      await mockNFT.approve(sendToHash.address, 1)

      await sendToHash.sendToAnyone(signer3Hash, 50, ASSET_TYPE_COIN, ZERO_ADDRESS, 1, {value: dollarInWei.add(1500)})
      await sendToHash.sendToAnyone(signer1Hash, 50, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHash.sendToAnyone(signer2Hash, 50, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei})
      await sendToHash.moveAssetToOtherHash(signer3Hash, 'd', ASSET_TYPE_COIN, ZERO_ADDRESS)
      await sendToHash.moveAssetToOtherHash(signer1Hash, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)
      await sendToHash.moveAssetToOtherHash(signer2Hash, signer3Hash, ASSET_TYPE_NFT, mockNFT.address)

      await expect(sendToHash.connect(signer1).revertPayment(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
          .to.be.revertedWith('Nothing to revert.')
      await expect(sendToHash.connect(signer1).revertPayment(signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
          .to.be.revertedWith('Nothing to revert.')
      await expect(sendToHash.connect(signer1).revertPayment(signer3Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
          .to.be.revertedWith('Nothing to revert.')
   })

   it ('reverts revertPayment() when there is nothing to revert', async () => {
      await expect(sendToHash.connect(signer1).revertPayment(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.revertedWith('Nothing to revert.')
      await expect(sendToHash.connect(signer1).revertPayment(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.revertedWith('Nothing to revert.')
      await expect(sendToHash.connect(signer1).revertPayment(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.revertedWith('Nothing to revert.')
   })

   it ('reverts revertPayment() when trying go revert payment second time', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockToken.approve(sendToHash.address, 50)
      await sendToHash.sendToAnyone(signer1Hash, 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})

      await expect(() => sendToHash.revertPayment(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [5, -5])

      await expect(sendToHash.revertPayment(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.revertedWith('Nothing to revert.')
   })

   it ('properly handles successful revertPayment()', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockToken.transfer(signer1Address, 50)
      await mockToken.connect(signer1).approve(sendToHash.address, 50)
      await sendToHash.connect(signer1).sendToAnyone(signer1Hash, 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})

      await expect(() => sendToHash.connect(signer1).revertPayment(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.changeTokenBalances(mockToken, [signer1, sendToHash], [5, -5])

      expect(await mockToken.balanceOf(signer1Address)).to.be.equal(50)
      expect(await mockToken.balanceOf(sendToHash.address)).to.be.equal(0)
   })

   it ('reverts claim() when there is nothing to claim', async () => {
      await expect(sendToHash.connect(signer1).claim(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.revertedWith('Nothing to claim.')
      await expect(sendToHash.connect(signer1).claim(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.revertedWith('Nothing to claim.')
      await expect(sendToHash.connect(signer1).claim(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.revertedWith('Nothing to claim.')
   })

   it ('reverts claim() when IDriss hash does not resolve to proper address', async () => {
      await expect(sendToHash.connect(signer1).claim('invalid', ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.revertedWith('IDriss not found.')
      await expect(sendToHash.connect(signer1).claim('invalid', ASSET_TYPE_NFT, mockNFT.address))
         .to.be.revertedWith('IDriss not found.')
      await expect(sendToHash.connect(signer1).claim('invalid', ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.revertedWith('IDriss not found.')
   })

   it ('properly handles successful claim()', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const totalPaymentsValue = 234000 + 850
      const prices = [
         dollarInWei.add(234000),
         dollarInWei.add(850),
      ]

      await mockNFT.approve(sendToHash.address, 2)
      await mockToken.approve(sendToHash.address, 50)
      await sendToHash.sendToAnyone(signer1Hash, 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 2, {value: dollarInWei})

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[0]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(prices[0]), prices[0]])

      await expect(() => sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, mockToken2.address, 0, {value: prices[1]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(prices[1]), prices[1]])

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, mockToken.address)).to.be.equal(234000 + 850)

      expect(await mockToken.balanceOf(signer1Address)).to.be.equal(0)
      expect(await mockToken.balanceOf(sendToHash.address)).to.be.equal(5)
      expect(await mockNFT.ownerOf(2)).to.be.equal(sendToHash.address)

      await expect(() => sendToHash.connect(signer1).claim(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.changeTokenBalances(mockToken, [signer1, sendToHash], [5, -5])

      await expect(() => sendToHash.connect(signer1).claim(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [1, -1])

      expect(await mockToken.balanceOf(signer1Address)).to.be.equal(5)
      expect(await mockToken.balanceOf(sendToHash.address)).to.be.equal(0)
      expect(await mockNFT.ownerOf(2)).to.be.equal(signer1Address)

      await expect(() => sendToHash.connect(signer1).claim(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.changeEtherBalances([signer1, sendToHash], [totalPaymentsValue, -totalPaymentsValue])
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(0)
   })

   it ('reverts claim() when non owner tries to claim payment', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      const payment = dollarInWei.add(234000)

      await mockNFT.approve(sendToHash.address, 2)
      await mockToken.approve(sendToHash.address, 50)
      await sendToHash.sendToAnyone(signer1Hash, 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 2, {value: dollarInWei})
      await sendToHash.connect(signer3).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: payment})

      await expect(sendToHash.connect(signer2).claim(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.revertedWith('Only owner can claim payments.')

      await expect(sendToHash.connect(signer2).claim(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.revertedWith('Only owner can claim payments.')

      await expect(sendToHash.connect(signer3).claim(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.revertedWith('Only owner can claim payments.')

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(234000)
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(5)
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
   })

   it ('sets minimal fee properly', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei() //1$
      const newMinimalFee = dollarInWei.mul(43).div(10)
      const payment = newMinimalFee.add(2345000)

      await sendToHash.changeMinimalPaymentFee(43, 10) //4.3$

      await mockNFT.approve(sendToHash.address, 2)
      await mockToken.approve(sendToHash.address, 50)
      await sendToHash.sendToAnyone(signer1Hash, 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: newMinimalFee.mul(95).div(100)})
      await sendToHash.connect(signer3).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: payment})

      await expect(sendToHash.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 2, {value: newMinimalFee.div(2)}))
         .to.be.revertedWith('Value sent is smaller than minimal fee.')

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(2345000)
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(5)
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(0)
   })

   it ('sets percentage fee properly', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei() //1$
      const payment = dollarInWei.mul(200)
      const paymentFee = payment.mul(25).div(1000)

      await sendToHash.changePaymentFeePercentage(25, 1000) //2.5%

      await mockNFT.approve(sendToHash.address, 2)
      await mockToken.approve(sendToHash.address, 50)
      await sendToHash.sendToAnyone(signer1Hash, 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei.mul(95).div(100)})
      await sendToHash.connect(signer3).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: payment})

      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(payment.sub(paymentFee))
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(5)
      expect(await sendToHash.balanceOf(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(0)
   })

   it ('reverts when trying to set 0 fee', async () => {
      await expect(sendToHash.changeMinimalPaymentFee(0, 1))
          .to.be.revertedWith('Payment fee has to be bigger than 0')
      await expect(sendToHash.changeMinimalPaymentFee(2, 0))
          .to.be.revertedWith('Payment fee denominator has to be bigger than 0')
      await expect(sendToHash.changePaymentFeePercentage(0, 1))
          .to.be.revertedWith('Payment fee has to be bigger than 0')
      await expect(sendToHash.changePaymentFeePercentage(2, 0))
          .to.be.revertedWith('Payment fee denominator has to be bigger than 0')
   })

   it ('reverts when non-owner tries to set payment fee', async () => {
      await expect(sendToHash.connect(signer1).changeMinimalPaymentFee(0, 1))
          .to.be.revertedWith('Ownable: caller is not the owner')
      await expect(sendToHash.connect(signer1).changeMinimalPaymentFee(2, 0))
          .to.be.revertedWith('Ownable: caller is not the owner')
      await expect(sendToHash.connect(signer1).changePaymentFeePercentage(0, 1))
          .to.be.revertedWith('Ownable: caller is not the owner')
      await expect(sendToHash.connect(signer1).changePaymentFeePercentage(2, 0))
          .to.be.revertedWith('Ownable: caller is not the owner')
   })

   it ('reverts claim() when trying go claim payment for second time', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockToken.approve(sendToHash.address, 50)
      await sendToHash.sendToAnyone(signer1Hash, 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})

      await expect(() => sendToHash.connect(signer1).claim(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.changeTokenBalances(mockToken, [signer1, sendToHash], [5, -5])

      await expect(sendToHash.claim(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.revertedWith('Nothing to claim.')
   })

   it ('emits events on successful function invocations', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await expect(sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, signer1Address, 0, {value: dollarInWei.add(99999)}))
         .to.emit(sendToHash, 'AssetTransferred')
         .withArgs(signer1Hash, ownerAddress, ZERO_ADDRESS, 99999);

      await expect(sendToHash.connect(signer1).claim(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.emit(sendToHash, 'AssetClaimed')
         .withArgs(signer1Hash, signer1Address, ZERO_ADDRESS, 99999);

      await sendToHash.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, signer1Address, 0, {value: dollarInWei.add(99999)})
      await expect(sendToHash.revertPayment(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.emit(sendToHash, 'AssetTransferReverted')
         .withArgs(signer1Hash, ownerAddress, ZERO_ADDRESS, 99999);
   })
})
