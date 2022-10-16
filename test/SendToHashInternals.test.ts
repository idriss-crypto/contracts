import {  waffle } from 'hardhat'
import { BigNumber, Signer } from 'ethers'
import chai, { expect } from 'chai'
import IDrissArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/IDriss.json'
import MaticPriceAggregatorV3MockArtifact from '../src/artifacts/src/contracts/mocks/MaticPriceAggregatorV3Mock.sol/MaticPriceAggregatorV3Mock.json'
import MockERC1155Artifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockERC1155.json'
import MockNFTArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockNFT.json'
import MockTokenArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockToken.json'
import { MockToken, SendToHashMock, SendToHashMockData, SendToHashUtilsMock, MockNFT, MaticPriceAggregatorV3Mock, IDriss, MockERC1155 } from '../src/types'
import SendToHashArtifact from '../src/artifacts/src/contracts/mocks/SendToHashMock.sol/SendToHashMock.json'
import SendToHashDataArtifact from '../src/artifacts/src/contracts/mocks/SendToHashMockData.sol/SendToHashMockData.json'
import SendToHashUtilsArtifact from '../src/artifacts/src/contracts/mocks/SendToHashUtilsMock.sol/SendToHashUtilsMock.json'
import chaiAsPromised from 'chai-as-promised'
import { MockProvider, solidity } from 'ethereum-waffle'

chai.use(solidity) // solidiity matchers, e.g. expect().to.be.revertedWith("message")
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
   [3, 160],
   [4, 1_000_000],
   [5, 996]
]

describe('SendToHashMock contract', async () => {
   let owner: Signer;
   let signer1: Signer;
   let signer2: Signer;
   let signer3: Signer;
   let ownerAddress: string;
   let signer1Address: string;
   let signer2Address: string;
   let signer3Address: string;
   let signer1ClaimPassword = 'pass-a';
   let signer2ClaimPassword = 'pass-b';
   let signer3ClaimPassword = 'pass-c';
   let signer1Hash: string;
   let signer2Hash: string;
   let signer3Hash: string;
   let signer1HashForClaim = 'a'
   let signer2HashForClaim = 'b'
   let signer3HashForClaim = 'c'
   let mockToken: MockToken
   let mockToken2: MockToken
   let mockNFT: MockNFT
   let mockNFT2: MockNFT
   let mockERC1155: MockERC1155
   let mockERC1155_2: MockERC1155
   let sendToHashMock: SendToHashMock
   let sendToHashMockData: SendToHashMockData
   let sendToHashUtilsMock: SendToHashUtilsMock
   let idriss: IDriss
   let mockPriceOracle: MaticPriceAggregatorV3Mock
   let provider: MockProvider

   beforeEach(async () => {
      provider = new MockProvider({ ganacheOptions: { gasLimit: '50000000000' } })
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
      mockERC1155 = (await waffle.deployContract(owner, MockERC1155Artifact, [])) as MockERC1155
      mockERC1155_2 = (await waffle.deployContract(owner, MockERC1155Artifact, [])) as MockERC1155
      mockPriceOracle = (await waffle.deployContract(owner, MaticPriceAggregatorV3MockArtifact, [])) as MaticPriceAggregatorV3Mock
      idriss = (await waffle.deployContract(owner, IDrissArtifact, [])) as IDriss
      sendToHashMock = (await waffle.deployContract(owner, SendToHashArtifact,
         [idriss.address, mockPriceOracle.address])) as SendToHashMock
      sendToHashMockData = (await waffle.deployContract(owner, SendToHashDataArtifact,
         [idriss.address, mockPriceOracle.address])) as SendToHashMockData
      sendToHashUtilsMock = (await waffle.deployContract(owner, SendToHashUtilsArtifact, [])) as SendToHashUtilsMock

      signer1Hash = await sendToHashMockData.hashIDrissWithPassword(signer1HashForClaim, signer1ClaimPassword);
      signer2Hash = await sendToHashMockData.hashIDrissWithPassword(signer2HashForClaim, signer2ClaimPassword);
      signer3Hash = await sendToHashMockData.hashIDrissWithPassword(signer3HashForClaim, signer3ClaimPassword);

      await idriss.addIDriss(signer1HashForClaim, signer1Address)
      await idriss.addIDriss(signer2HashForClaim, signer2Address)
      await idriss.addIDriss(signer3HashForClaim, signer3Address)
      await idriss.addIDriss('0', ZERO_ADDRESS)

      await Promise.all(
         NFT_ID_ARRAY.map( async (val, idx, _) => { 
            await mockNFT.safeMint(ownerAddress, val).catch(_ => {})
            return mockNFT2.safeMint(ownerAddress, val).catch(_ => {})
         })
      )

      await Promise.all(
          ERC1155_ARRAY.map( async (val, idx, _) => {
             await mockERC1155.mint(ownerAddress, val[0],  val[1]).catch(_ => {})
             return mockERC1155_2.mint(ownerAddress, val[0],  val[1]).catch(_ => {})
          })
      )
   })

   it ('properly calculates fee for a payment', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const payments = [
         dollarInWei,
         dollarInWei.add(2340000),
         dollarInWei.mul(95).div(100),
         dollarInWei.mul(99).div(100),
         dollarInWei.mul(105).div(100),
         dollarInWei.mul(100),
         dollarInWei.mul(1200),
      ]

      const [fee, value] = await sendToHashMock.splitPayment(payments[0])
      const [fee1, value1] = await sendToHashMock.splitPayment(payments[1])
      const [fee2, value2] = await sendToHashMock.splitPayment(payments[2])
      const [fee3, value3] = await sendToHashMock.splitPayment(payments[3])
      const [fee4, value4] = await sendToHashMock.splitPayment(payments[4])
      const [fee5, value5] = await sendToHashMock.splitPayment(payments[5])
      const [fee6, value6] = await sendToHashMock.splitPayment(payments[6])

      expect(fee).to.be.equal(dollarInWei)
      expect(value).to.be.equal(0)

      expect(fee1).to.be.equal(dollarInWei)
      expect(value1).to.be.equal(2340000)

      expect(fee2).to.be.equal(payments[2])
      expect(value2).to.be.equal(0)

      expect(fee3).to.be.equal(payments[3])
      expect(value3).to.be.equal(0)

      expect(fee4).to.be.equal(dollarInWei)
      expect(value4).to.be.equal(payments[4].sub(dollarInWei))

      expect(fee5).to.be.equal(dollarInWei)
      expect(value5).to.be.equal(dollarInWei.mul(99))

      expect(fee6).to.be.equal(dollarInWei.mul(12))
      expect(value6).to.be.equal(dollarInWei.mul(1188))
   })

   it ('properly calculates fee for non native token', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      const paymentFeeToken = await sendToHashMock.getPaymentFee(dollarInWei.mul(1000), ASSET_TYPE_TOKEN)
      const paymentFeeNFT = await sendToHashMock.getPaymentFee(dollarInWei.mul(564), ASSET_TYPE_NFT)
      const paymentFeeERC1155 = await sendToHashMock.getPaymentFee(dollarInWei.mul(564), ASSET_TYPE_ERC1155)

      expect(paymentFeeToken).to.be.equal(dollarInWei)
      expect(paymentFeeNFT).to.be.equal(dollarInWei)
      expect(paymentFeeERC1155).to.be.equal(dollarInWei)
   })

   it ('properly calculates fee for native currency', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      const paymentFee0 = await sendToHashMock.getPaymentFee(dollarInWei.mul(95).div(100), ASSET_TYPE_COIN)
      const paymentFee1 = await sendToHashMock.getPaymentFee(dollarInWei.mul(1), ASSET_TYPE_COIN)
      const paymentFee2 = await sendToHashMock.getPaymentFee(dollarInWei.mul(10), ASSET_TYPE_COIN)
      const paymentFee3 = await sendToHashMock.getPaymentFee(dollarInWei.mul(100), ASSET_TYPE_COIN)
      const paymentFee4 = await sendToHashMock.getPaymentFee(dollarInWei.mul(101), ASSET_TYPE_COIN)
      const paymentFee5 = await sendToHashMock.getPaymentFee(dollarInWei.mul(555), ASSET_TYPE_COIN)

      expect(paymentFee0).to.be.equal(dollarInWei) // we accept slippage, but won't count in for it here
      expect(paymentFee1).to.be.equal(dollarInWei)
      expect(paymentFee2).to.be.equal(dollarInWei)
      expect(paymentFee3).to.be.equal(dollarInWei)
      expect(paymentFee4).to.be.equal(dollarInWei.mul(101).div(100))
      expect(paymentFee5).to.be.equal(dollarInWei.mul(555).div(100))
   })

   it ('properly calculates fee after changing percentage fee', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      let currentFee = dollarInWei.mul(2)
      const payments = [
         dollarInWei.mul(100), //100$
         dollarInWei.mul(200), //200$ + 245_000
      ]

      await sendToHashMock.changePaymentFeePercentage(2, 100)
      const [fee, value] = await sendToHashMock.splitPayment(payments[0])
      expect(fee).to.be.equal(currentFee)
      expect(value).to.be.equal(dollarInWei.mul(98))

      currentFee = dollarInWei.mul(3)
      await sendToHashMock.changePaymentFeePercentage(15, 1000)
      const [fee1, value1] = await sendToHashMock.splitPayment(payments[1])
      expect(fee1).to.be.equal(currentFee)
      expect(value1).to.be.equal(dollarInWei.mul(197))
   })

   it ('properly calculates fee after changing minimal fee', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      let currentFee = dollarInWei.mul(10)
      const payments = [
         dollarInWei.mul(10), //10$
         dollarInWei.div(2).add(245000), //0.5$ + 245_000
         dollarInWei.mul(36).div(2).add(100), //18$ + 100 wei
         dollarInWei.mul(36).div(2).mul(95).div(100) //95% of 18$
      ]

      await sendToHashMock.changeMinimalPaymentFee(10, 1)
      const [fee, value] = await sendToHashMock.splitPayment(payments[0])
      expect(fee).to.be.equal(currentFee)
      expect(value).to.be.equal(0)

      currentFee = dollarInWei.div(2)
      await sendToHashMock.changeMinimalPaymentFee(5, 10)
      const [fee1, value1] = await sendToHashMock.splitPayment(payments[1])
      expect(fee1).to.be.equal(currentFee)
      expect(value1).to.be.equal(245000)

      currentFee = dollarInWei.mul(18)
      await sendToHashMock.changeMinimalPaymentFee(180, 10)
      const [fee2, value2] = await sendToHashMock.splitPayment(payments[2])
      expect(fee2).to.be.equal(currentFee)
      expect(value2).to.be.equal(100)

      currentFee = dollarInWei.mul(18)
      await sendToHashMock.changeMinimalPaymentFee(3600, 200)
      const [fee3, value3] = await sendToHashMock.splitPayment(payments[3])
      expect(fee3).to.be.equal(currentFee.mul(95).div(100))
      expect(value3).to.be.equal(0)
   })

   it ('properly translates characters to bytes', async () => {
      for(let i = 0; i < 10; i++) {
         expect(await sendToHashMock.fromHexChar('0'.charCodeAt(0) + i)).to.be.equal(i)
      }

      for(let i = 0; i < 6; i++) {
         expect(await sendToHashMock.fromHexChar('a'.charCodeAt(0) + i)).to.be.equal(10 + i)
         expect(await sendToHashMock.fromHexChar('A'.charCodeAt(0) + i)).to.be.equal(10 + i)
      }

      for (let c of ['X', 'x', 't', 'G', '#', '@', '(']) {
         await expect(sendToHashMock.fromHexChar(c.charCodeAt(0)))
            .to.be.revertedWith('Unparseable hex character found in address.')
      }
   })

   it ('properly translates address string to address bytes', async () => {
      expect(await sendToHashMock.safeHexStringToAddress(signer1Address)).to.be.equal(signer1Address)
      expect(await sendToHashMock.safeHexStringToAddress(signer2Address)).to.be.equal(signer2Address)
      expect(await sendToHashMock.safeHexStringToAddress(signer3Address)).to.be.equal(signer3Address)

      await expect(sendToHashMock.safeHexStringToAddress("0xaf5a"))
         .to.be.revertedWith('Address length is invalid')

      await expect(sendToHashMock.safeHexStringToAddress("0xaf5aaf5aaf5aaf5aaf5aaf5aaf5aaf5aaf5aaf5aaf5aaf5aaf5aaf5aaf5a"))
         .to.be.revertedWith('Address length is invalid')

      await expect(sendToHashMock.safeHexStringToAddress( '0x0000000000kkkkkkkkkkkk000000HZGRRRRRRR00'))
         .to.be.revertedWith('Unparseable hex character found in address.')
   })

   it ('properly handles translating IDriss hash to address', async () => {
      const testHashes: any = {}
      testHashes['test1'] = signer1Address
      testHashes['test2'] = signer2Address
      testHashes['test3'] = signer3Address

      for (let key in testHashes) {
         const value = testHashes[key]
         await idriss.addIDriss(key, value)
         expect(await sendToHashMock.getAddressFromHash(key)).to.be.equal(value)
      }

      await idriss.addIDriss('test4', ZERO_ADDRESS)
      await expect(sendToHashMock.getAddressFromHash('test4'))
         .to.be.revertedWith('Address for the IDriss hash cannot resolve to 0x0')

      await expect(sendToHashMock.getAddressFromHash('nonexistent'))
         .to.be.revertedWith('IDriss not found.')
   })

   it ('properly handles internal mappings when invoking valid sendToAnyone() for coin', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      const prices = [
         dollarInWei.add(10000),
         dollarInWei.add(230),
         dollarInWei.add(50),
         dollarInWei.add(17)
      ]

      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, "", {value: prices[0]})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer2Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, "", {value: prices[1]})

      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([signer2Address])
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([signer2Address])

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(10000)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length).to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(10000)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length)
         .to.be.equal(0)

      await sendToHashMockData.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, "", {value: prices[2]})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, "", {value: prices[3]})

      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([signer2Address, ownerAddress])

      expect(await sendToHashMockData.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(50)
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(10017)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length).to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(10067)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length).to.be.equal(0)

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(230)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length).to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(230)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length).to.be.equal(0)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(true)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(true)
   })

   it ('properly handles internal mappings when invoking valid sendToAnyone() for token', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockToken.transfer(signer2Address, 10000)
      await mockToken.approve(sendToHashMockData.address, 10000)
      await mockToken.connect(signer2).approve(sendToHashMockData.address, 10000)

      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 60, ASSET_TYPE_TOKEN, mockToken.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer2Hash, 110, ASSET_TYPE_TOKEN, mockToken.address, 0, "", {value: dollarInWei})

      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.have.members([signer2Address])
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.have.members([signer2Address])

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(60)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).length).to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(60)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length)
         .to.be.equal(0)

      await sendToHashMockData.sendToAnyone(signer1Hash, 75, ASSET_TYPE_TOKEN, mockToken.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 90, ASSET_TYPE_TOKEN, mockToken.address, 0, "", {value: dollarInWei})

      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.have.members([signer2Address, ownerAddress])

      expect(await sendToHashMockData.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(75)
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(150)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).length).to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(225)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length).to.be.equal(0)

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(110)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).length).to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(110)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length).to.be.equal(0)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(true)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(true)
   })

   it ('properly handles internal mappings when invoking valid sendToAnyone() for NFT', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockNFT.transferFrom(ownerAddress, signer2Address, 0)
      await mockNFT.transferFrom(ownerAddress, signer2Address, 1)
      await mockNFT.transferFrom(ownerAddress, signer2Address, 2)
      await mockNFT.approve(sendToHashMockData.address, 3)
      await mockNFT.approve(sendToHashMockData.address, 4)
      await mockNFT.approve(sendToHashMockData.address, 5)
      await mockNFT.connect(signer2).approve(sendToHashMockData.address, 0)
      await mockNFT.connect(signer2).approve(sendToHashMockData.address, 1)
      await mockNFT.connect(signer2).approve(sendToHashMockData.address, 2)

      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, "", {value: dollarInWei})

      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([signer2Address])
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([signer2Address])

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(1)
      expect(await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.deep.members([BigNumber.from(0)])
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
      expect(await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address))
         .to.have.deep.members([BigNumber.from(0)])
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress)).length)
         .to.be.equal(0)

      await sendToHashMockData.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 3, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 2, "", {value: dollarInWei})

      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([signer2Address, ownerAddress])

      expect(await sendToHashMockData.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(2)
      expect(await sendToHashMockData.getPayerAssetMapAssetIds(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.deep.members([BigNumber.from(3)])
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(3)
      expect(await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address))
         .to.have.deep.members([BigNumber.from(0), BigNumber.from(2)])
      expect(await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress))
         .to.have.deep.members([BigNumber.from(3)])

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
      expect(await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.deep.members([BigNumber.from(1)])
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
      expect(await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address))
         .to.have.deep.members([BigNumber.from(1)])
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress)).length).to.be.equal(0)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(true)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(true)
   })

   it ('properly handles internal mappings when invoking valid sendToAnyone() for ERC1155', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockERC1155.safeTransferFrom(ownerAddress, signer2Address, 0, 1, "0x")
      await mockERC1155.safeTransferFrom(ownerAddress, signer2Address, 1, 1, "0x")
      await mockERC1155.safeTransferFrom(ownerAddress, signer2Address, 2, 1, "0x")
      await mockERC1155.safeTransferFrom(ownerAddress, signer2Address, 4, 100, "0x")
      await mockERC1155.setApprovalForAll(sendToHashMockData.address, true)
      await mockERC1155.connect(signer2).setApprovalForAll(sendToHashMockData.address, true)

      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_ERC1155, mockERC1155.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer2Hash, 1, ASSET_TYPE_ERC1155, mockERC1155.address, 1, "", {value: dollarInWei})

      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.have.members([signer2Address])
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.have.members([signer2Address])


      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(1)

      const payerAmounts1 = await sendToHashMockData.getPayerAssetMapAssetIdAmounts(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)
      expect(payerAmounts1.length).to.be.equal(1)
      expect(payerAmounts1[0]['id'].toString()).to.be.equal('0')
      expect(payerAmounts1[0]['amount'].toString()).to.be.equal('1')

      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).to.be.equal(1)
      const benefAmounts1 = await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address, signer2Address)
      expect(benefAmounts1.length).to.be.equal(1)
      expect(benefAmounts1[0]['id'].toString()).to.be.equal('0')
      expect(benefAmounts1[0]['amount'].toString()).to.be.equal('1')

      expect((await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address, ownerAddress)).length)
          .to.be.equal(0)

      await sendToHashMockData.sendToAnyone(signer1Hash, 6, ASSET_TYPE_ERC1155, mockERC1155.address, 3, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 15, ASSET_TYPE_ERC1155, mockERC1155.address, 4, "", {value: dollarInWei})

      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.have.members([signer2Address, ownerAddress])

      expect(await sendToHashMockData.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).to.be.equal(6)
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).to.be.equal(16)
      const payerAmounts2 = await sendToHashMockData.getPayerAssetMapAssetIdAmounts(ownerAddress, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)
      expect(payerAmounts2.length).to.be.equal(1)
      expect(payerAmounts2[0]['id'].toString()).to.be.equal('3')
      expect(payerAmounts2[0]['amount'].toString()).to.be.equal('6')

      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).to.be.equal(22)

      const benefAmounts2 = await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address, signer2Address)
      expect(benefAmounts2.length).to.be.equal(2)
      expect(benefAmounts2[0]['id'].toString()).to.be.equal('0')
      expect(benefAmounts2[0]['amount'].toString()).to.be.equal('1')
      expect(benefAmounts2[1]['id'].toString()).to.be.equal('4')
      expect(benefAmounts2[1]['amount'].toString()).to.be.equal('15')

      const benefAmounts3 = await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address, ownerAddress)
      expect(benefAmounts3.length).to.be.equal(1)
      expect(benefAmounts3[0]['id'].toString()).to.be.equal('3')
      expect(benefAmounts3[0]['amount'].toString()).to.be.equal('6')

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).to.be.equal(1)

      const payerAmounts3 = await sendToHashMockData.getPayerAssetMapAssetIdAmounts(signer2Address, signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address)
      expect(payerAmounts3.length).to.be.equal(1)
      expect(payerAmounts3[0]['id'].toString()).to.be.equal('1')
      expect(payerAmounts3[0]['amount'].toString()).to.be.equal('1')

      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).to.be.equal(1)

      const benefAmounts4 = await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address, signer2Address)
      expect(benefAmounts4.length).to.be.equal(1)
      expect(benefAmounts4[0]['id'].toString()).to.be.equal('1')
      expect(benefAmounts4[0]['amount'].toString()).to.be.equal('1')

      const benefAmounts5 = await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address, ownerAddress)
      expect(benefAmounts5.length).to.be.equal(0)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(true)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(true)
   })

   it ('properly handles internal mappings when invoking valid revert() for coin', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      const prices = [
         dollarInWei.add(10000),
         dollarInWei.add(230),
         dollarInWei.add(50),
         dollarInWei.add(17)
      ]

      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, "", {value: prices[0]})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer2Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, "", {value: prices[1]})
      await sendToHashMockData.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, "", {value: prices[2]})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, "", {value: prices[3]})

      await sendToHashMockData.connect(signer2).revertPayment(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)

      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([ownerAddress])
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([signer2Address])

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(true)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(true)

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(0)
      expect(await sendToHashMockData.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(50)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(50)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length)
         .to.be.equal(0)

      await sendToHashMockData.revertPayment(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)

      expect((await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([signer2Address])

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(true)

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(230)
      expect(await sendToHashMockData.getPayerAssetMapAmount(ownerAddress, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(230)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length)
         .to.be.equal(0)
   })

   it ('properly handles internal mappings when invoking valid revert() for token', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockToken.transfer(signer2Address, 10000)
      await mockToken.approve(sendToHashMockData.address, 10000)
      await mockToken.connect(signer2).approve(sendToHashMockData.address, 10000)

      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 60, ASSET_TYPE_TOKEN, mockToken.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer2Hash, 110, ASSET_TYPE_TOKEN, mockToken.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 75, ASSET_TYPE_TOKEN, mockToken.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 90, ASSET_TYPE_TOKEN, mockToken.address, 0, "", {value: dollarInWei})

      await sendToHashMockData.connect(signer2).revertPayment(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(true)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(true)

      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.have.members([ownerAddress])
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.have.members([signer2Address])

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(75)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length)
         .to.be.equal(0)

      await sendToHashMockData.connect(signer2).revertPayment(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)

      await sendToHashMockData.revertPayment(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)

      expect(await sendToHashMockData.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
   })

   it ('properly handles internal mappings when invoking valid revert() for NFT', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockNFT.transferFrom(ownerAddress, signer2Address, 0)
      await mockNFT.transferFrom(ownerAddress, signer2Address, 1)
      await mockNFT.transferFrom(ownerAddress, signer2Address, 2)
      await mockNFT.approve(sendToHashMockData.address, 3)
      await mockNFT.approve(sendToHashMockData.address, 4)
      await mockNFT.approve(sendToHashMockData.address, 5)
      await mockNFT.connect(signer2).approve(sendToHashMockData.address, 0)
      await mockNFT.connect(signer2).approve(sendToHashMockData.address, 1)
      await mockNFT.connect(signer2).approve(sendToHashMockData.address, 2)

      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 3, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 4, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 5, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 2, "", {value: dollarInWei})

      await sendToHashMockData.connect(signer2).revertPayment(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)

      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([ownerAddress])
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([signer2Address])
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(3)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress))
         .to.have.deep.members([BigNumber.from(3), BigNumber.from(4), BigNumber.from(5)])

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(true)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(true)

      await sendToHashMockData.revertPayment(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)

      expect((await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([signer2Address])
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(true)
   })

   it ('properly handles internal mappings when invoking valid revert() for ERC1155', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockERC1155.safeTransferFrom(ownerAddress, signer2Address, 0, 1, "0x")
      await mockERC1155.safeTransferFrom(ownerAddress, signer2Address, 1, 1, "0x")
      await mockERC1155.safeTransferFrom(ownerAddress, signer2Address, 3, 50, "0x")
      await mockERC1155.setApprovalForAll(sendToHashMockData.address, true)
      await mockERC1155.connect(signer2).setApprovalForAll(sendToHashMockData.address, true)

      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_ERC1155, mockERC1155.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer2Hash, 1, ASSET_TYPE_ERC1155, mockERC1155.address, 1, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 10, ASSET_TYPE_ERC1155, mockERC1155.address, 3, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 5, ASSET_TYPE_ERC1155, mockERC1155.address, 4, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 97, ASSET_TYPE_ERC1155, mockERC1155.address, 5, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 20, ASSET_TYPE_ERC1155, mockERC1155.address, 3, "", {value: dollarInWei})

      await sendToHashMockData.connect(signer2).revertPayment(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)

      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.have.members([ownerAddress])
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.have.members([signer2Address])
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).length)
          .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).to.be.equal(112)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address, signer2Address)).length)
          .to.be.equal(0)

      const benef1 = await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address, ownerAddress)
      expect(benef1.length).to.be.equal(3)
      expect(benef1[0]['id'].toString()).to.be.equal('3')
      expect(benef1[0]['amount'].toString()).to.be.equal('10')
      expect(benef1[1]['id'].toString()).to.be.equal('4')
      expect(benef1[1]['amount'].toString()).to.be.equal('5')
      expect(benef1[2]['id'].toString()).to.be.equal('5')
      expect(benef1[2]['amount'].toString()).to.be.equal('97')

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(true)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(true)

      await sendToHashMockData.revertPayment(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)

      expect((await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).length)
          .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.have.members([signer2Address])
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).length)
          .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address, signer2Address)).length)
          .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address, ownerAddress)).length)
          .to.be.equal(0)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(true)
   })

   it ('properly handles internal mappings when invoking valid claim() for coin', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      const prices = [
         dollarInWei.add(10000),
         dollarInWei.add(230),
         dollarInWei.add(50),
         dollarInWei.add(17)
      ]

      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, "", {value: prices[0]})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer2Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, "", {value: prices[1]})
      await sendToHashMockData.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, "", {value: prices[2]})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, "", {value: prices[3]})

      await sendToHashMockData.connect(signer1).claim(signer1HashForClaim, signer1ClaimPassword, ASSET_TYPE_COIN, ZERO_ADDRESS)

      expect((await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([signer2Address])

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(true)

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(0)
      expect(await sendToHashMockData.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(230)
      expect(await sendToHashMockData.getPayerAssetMapAmount(ownerAddress, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(230)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length)
         .to.be.equal(0)
   })

   it ('properly handles internal mappings when invoking valid claim() for token', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockToken.transfer(signer2Address, 10000)
      await mockToken.approve(sendToHashMockData.address, 10000)
      await mockToken.connect(signer2).approve(sendToHashMockData.address, 10000)

      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 60, ASSET_TYPE_TOKEN, mockToken.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer2Hash, 110, ASSET_TYPE_TOKEN, mockToken.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 75, ASSET_TYPE_TOKEN, mockToken.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 90, ASSET_TYPE_TOKEN, mockToken.address, 0, "", {value: dollarInWei})

      await sendToHashMockData.connect(signer1).claim(signer1HashForClaim, signer1ClaimPassword, ASSET_TYPE_TOKEN, mockToken.address)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(true)

      expect((await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.have.members([signer2Address])

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect(await sendToHashMockData.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(110)
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(110)

      await sendToHashMockData.connect(signer2).claim(signer2HashForClaim, signer2ClaimPassword, ASSET_TYPE_TOKEN, mockToken.address)

      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
   })

   it ('properly handles internal mappings when invoking valid claim() for NFT', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockNFT.transferFrom(ownerAddress, signer2Address, 0)
      await mockNFT.transferFrom(ownerAddress, signer2Address, 1)
      await mockNFT.transferFrom(ownerAddress, signer2Address, 2)
      await mockNFT.approve(sendToHashMockData.address, 3)
      await mockNFT.approve(sendToHashMockData.address, 4)
      await mockNFT.approve(sendToHashMockData.address, 5)
      await mockNFT.connect(signer2).approve(sendToHashMockData.address, 0)
      await mockNFT.connect(signer2).approve(sendToHashMockData.address, 1)
      await mockNFT.connect(signer2).approve(sendToHashMockData.address, 2)

      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 3, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 4, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 5, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 2, "", {value: dollarInWei})

      await sendToHashMockData.connect(signer1).claim(signer1HashForClaim, signer1ClaimPassword, ASSET_TYPE_NFT, mockNFT.address)

      expect((await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([signer2Address])
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(0)

      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(true)

      await sendToHashMockData.connect(signer2).claim(signer2HashForClaim, signer2ClaimPassword, ASSET_TYPE_NFT, mockNFT.address)

      expect((await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
   })

   it ('properly handles internal mappings when invoking valid claim() for ERC1155', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockERC1155.setApprovalForAll(sendToHashMockData.address, true)
      await mockERC1155.connect(signer2).setApprovalForAll(sendToHashMockData.address, true)
      await mockERC1155.safeTransferFrom(ownerAddress, signer2Address, 0, 1, "0x")
      await mockERC1155.safeTransferFrom(ownerAddress, signer2Address, 1, 1, "0x")
      await mockERC1155.safeTransferFrom(ownerAddress, signer2Address, 2, 1, "0x")
      await mockERC1155.safeTransferFrom(ownerAddress, signer2Address, 3, 50, "0x")

      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_ERC1155, mockERC1155.address, 0, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer2Hash, 1, ASSET_TYPE_ERC1155, mockERC1155.address, 1, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 35, ASSET_TYPE_ERC1155, mockERC1155.address, 3, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 1, ASSET_TYPE_ERC1155, mockERC1155.address, 4, "", {value: dollarInWei})
      await sendToHashMockData.sendToAnyone(signer1Hash, 1, ASSET_TYPE_ERC1155, mockERC1155.address, 5, "", {value: dollarInWei})
      await sendToHashMockData.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_ERC1155, mockERC1155.address, 2, "", {value: dollarInWei})

      await sendToHashMockData.connect(signer1).claim(signer1HashForClaim, signer1ClaimPassword, ASSET_TYPE_ERC1155, mockERC1155.address)

      expect((await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).length)
          .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.have.members([signer2Address])
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(0)

      expect((await sendToHashMockData.getPayerAssetMapAssetIdAmounts(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).length)
          .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address, signer2Address)).length)
          .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address, ownerAddress)).length)
          .to.be.equal(0)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(true)

      await sendToHashMockData.connect(signer2).claim(signer2HashForClaim, signer2ClaimPassword, ASSET_TYPE_ERC1155, mockERC1155.address)

      expect((await sendToHashMockData.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).length)
          .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).length)
          .to.be.equal(0)
      expect(await sendToHashMockData.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(0)
      expect((await sendToHashMockData.getPayerAssetMapAssetIdAmounts(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).length)
          .to.be.equal(0)
      expect(await sendToHashMockData.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address)).to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address, signer2Address)).length)
          .to.be.equal(0)
      expect((await sendToHashMockData.getBeneficiaryMapAssetIdAmounts(signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address, ownerAddress)).length)
          .to.be.equal(0)

      expect(await sendToHashMockData.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(false)
      expect(await sendToHashMockData.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_ERC1155, mockERC1155.address))
          .to.be.equal(false)
   })
})
