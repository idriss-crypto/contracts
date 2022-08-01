import { ethers, waffle } from 'hardhat'
import { BigNumber, Signer } from 'ethers'
import chai, { expect } from 'chai'
import { IDriss } from '../src/types/IDriss'
import IDrissArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/IDriss.json'
import { MaticPriceAggregatorV3Mock } from '../src/types/MaticPriceAggregatorV3Mock'
import MaticPriceAggregatorV3MockArtifact from '../src/artifacts/src/contracts/mocks/MaticPriceAggregatorV3Mock.sol/MaticPriceAggregatorV3Mock.json'
import { MockNFT } from '../src/types/MockNFT'
import MockNFTArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockNFT.json'
import MockTokenArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockToken.json'
import { MockToken } from '../src/types/MockToken'
import { SendToHashMock } from '../src/types/SendToHashMock'
import SendToHashArtifact from '../src/artifacts/src/contracts/mocks/SendToHashMock.sol/SendToHashMock.json'
import chaiAsPromised from 'chai-as-promised'
import { MockProvider, solidity } from 'ethereum-waffle'
import { hashIDriss } from './TestUtils'

chai.use(solidity) // solidiity matchers, e.g. expect().to.be.revertedWith("message")
chai.use(chaiAsPromised) //eventually

const ASSET_TYPE_COIN = 0
const ASSET_TYPE_TOKEN = 1
const ASSET_TYPE_NFT = 2
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const NFT_ID_ARRAY = [... Array(10).keys()]

describe('SendToHashMock contract', async () => {
   let owner: Signer;
   let signer1: Signer;
   let signer2: Signer;
   let signer3: Signer;
   let ownerAddress: string;
   let signer1Address: string;
   let signer2Address: string;
   let signer3Address: string;
   let signer1Hash = await hashIDriss('a', 'pass-a');
   let signer2Hash = await hashIDriss('b', 'pass-b');
   let signer3Hash = await hashIDriss('c', 'pass-c');
   let mockToken: MockToken
   let mockToken2: MockToken
   let mockNFT: MockNFT
   let mockNFT2: MockNFT
   let sendToHashMock: SendToHashMock
   let idriss: IDriss
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
      sendToHashMock = (await waffle.deployContract(owner, SendToHashArtifact,
         [idriss.address, mockPriceOracle.address])) as SendToHashMock

      idriss.addIDriss(signer1Hash, signer1Address)
      idriss.addIDriss(signer2Hash, signer2Address)
      idriss.addIDriss(signer3Hash, signer3Address)
      idriss.addIDriss('0', ZERO_ADDRESS)

      Promise.all(
         NFT_ID_ARRAY.map( async (val, idx, _) => { 
            await mockNFT.safeMint(ownerAddress, val).catch(e => {})
            return mockNFT2.safeMint(ownerAddress, val).catch(e => {})
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

      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[0]})
      await sendToHashMock.connect(signer2).sendToAnyone(signer2Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[1]})

      expect(await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([signer2Address])
      expect(await sendToHashMock.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([signer2Address])

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(10000)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length).to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(10000)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length)
         .to.be.equal(0)

      await sendToHashMock.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[2]})
      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[3]})

      expect(await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([signer2Address, ownerAddress])

      expect(await sendToHashMock.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(50)
      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(10017)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length).to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(10067)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length).to.be.equal(0)

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(230)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length).to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(230)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length).to.be.equal(0)

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(true)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(true)
   })

   it ('properly handles internal mappings when invoking valid sendToAnyone() for token', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockToken.transfer(signer2Address, 10000)
      await mockToken.approve(sendToHashMock.address, 10000)
      await mockToken.connect(signer2).approve(sendToHashMock.address, 10000)

      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 60, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHashMock.connect(signer2).sendToAnyone(signer2Hash, 110, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})

      expect(await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.have.members([signer2Address])
      expect(await sendToHashMock.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.have.members([signer2Address])

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(60)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).length).to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(60)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length)
         .to.be.equal(0)

      await sendToHashMock.sendToAnyone(signer1Hash, 75, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 90, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})

      expect(await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.have.members([signer2Address, ownerAddress])

      expect(await sendToHashMock.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(75)
      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(150)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).length).to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(225)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length).to.be.equal(0)

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(110)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).length).to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(110)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length).to.be.equal(0)

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(true)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(true)
   })

   it ('properly handles internal mappings when invoking valid sendToAnyone() for NFT', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockNFT.transferFrom(ownerAddress, signer2Address, 0)
      await mockNFT.transferFrom(ownerAddress, signer2Address, 1)
      await mockNFT.transferFrom(ownerAddress, signer2Address, 2)
      await mockNFT.approve(sendToHashMock.address, 3)
      await mockNFT.approve(sendToHashMock.address, 4)
      await mockNFT.approve(sendToHashMock.address, 5)
      await mockNFT.connect(signer2).approve(sendToHashMock.address, 0)
      await mockNFT.connect(signer2).approve(sendToHashMock.address, 1)
      await mockNFT.connect(signer2).approve(sendToHashMock.address, 2)

      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 0, {value: dollarInWei})
      await sendToHashMock.connect(signer2).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei})

      expect(await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([signer2Address])
      expect(await sendToHashMock.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([signer2Address])

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(1)
      expect(await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.deep.members([BigNumber.from(0)])
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
      expect(await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address))
         .to.have.deep.members([BigNumber.from(0)])
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress)).length)
         .to.be.equal(0)

      await sendToHashMock.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 3, {value: dollarInWei})
      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 2, {value: dollarInWei})

      expect(await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([signer2Address, ownerAddress])

      expect(await sendToHashMock.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(2)
      expect(await sendToHashMock.getPayerAssetMapAssetIds(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.deep.members([BigNumber.from(3)])
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(3)
      expect(await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address))
         .to.have.deep.members([BigNumber.from(0), BigNumber.from(2)])
      expect(await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress))
         .to.have.deep.members([BigNumber.from(3)])

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
      expect(await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.deep.members([BigNumber.from(1)])
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(1)
      expect(await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address))
         .to.have.deep.members([BigNumber.from(1)])
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress)).length).to.be.equal(0)

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(true)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
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

      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[0]})
      await sendToHashMock.connect(signer2).sendToAnyone(signer2Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[1]})
      await sendToHashMock.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[2]})
      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[3]})

      await sendToHashMock.connect(signer2).revertPayment(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)

      expect(await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([ownerAddress])
      expect(await sendToHashMock.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([signer2Address])

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(true)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(true)

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(0)
      expect(await sendToHashMock.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(50)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(50)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length)
         .to.be.equal(0)

      await sendToHashMock.revertPayment(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)

      expect((await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([signer2Address])

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(true)

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(230)
      expect(await sendToHashMock.getPayerAssetMapAmount(ownerAddress, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(0)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(230)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length)
         .to.be.equal(0)
   })

   it ('properly handles internal mappings when invoking valid revert() for token', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockToken.transfer(signer2Address, 10000)
      await mockToken.approve(sendToHashMock.address, 10000)
      await mockToken.connect(signer2).approve(sendToHashMock.address, 10000)

      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 60, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHashMock.connect(signer2).sendToAnyone(signer2Hash, 110, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHashMock.sendToAnyone(signer1Hash, 75, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 90, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})

      await sendToHashMock.connect(signer2).revertPayment(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(true)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(true)

      expect(await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.have.members([ownerAddress])
      expect(await sendToHashMock.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.have.members([signer2Address])

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(75)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length)
         .to.be.equal(0)

      await sendToHashMock.connect(signer2).revertPayment(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)

      await sendToHashMock.revertPayment(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)

      expect(await sendToHashMock.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
   })

   it ('properly handles internal mappings when invoking valid revert() for NFT', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockNFT.transferFrom(ownerAddress, signer2Address, 0)
      await mockNFT.transferFrom(ownerAddress, signer2Address, 1)
      await mockNFT.transferFrom(ownerAddress, signer2Address, 2)
      await mockNFT.approve(sendToHashMock.address, 3)
      await mockNFT.approve(sendToHashMock.address, 4)
      await mockNFT.approve(sendToHashMock.address, 5)
      await mockNFT.connect(signer2).approve(sendToHashMock.address, 0)
      await mockNFT.connect(signer2).approve(sendToHashMock.address, 1)
      await mockNFT.connect(signer2).approve(sendToHashMock.address, 2)

      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 0, {value: dollarInWei})
      await sendToHashMock.connect(signer2).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei})
      await sendToHashMock.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 3, {value: dollarInWei})
      await sendToHashMock.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 4, {value: dollarInWei})
      await sendToHashMock.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 5, {value: dollarInWei})
      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 2, {value: dollarInWei})

      await sendToHashMock.connect(signer2).revertPayment(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)

      expect(await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([ownerAddress])
      expect(await sendToHashMock.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([signer2Address])
      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(0)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(3)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress))
         .to.have.deep.members([BigNumber.from(3), BigNumber.from(4), BigNumber.from(5)])

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(true)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(true)

      await sendToHashMock.revertPayment(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)

      expect((await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([signer2Address])
      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(0)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
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

      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[0]})
      await sendToHashMock.connect(signer2).sendToAnyone(signer2Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[1]})
      await sendToHashMock.sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[2]})
      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: prices[3]})

      await sendToHashMock.connect(signer1).claim(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)

      expect((await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.have.members([signer2Address])

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(true)

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(0)
      expect(await sendToHashMock.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(0)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(230)
      expect(await sendToHashMock.getPayerAssetMapAmount(ownerAddress, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS))
         .to.be.equal(0)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(230)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_COIN, ZERO_ADDRESS, ownerAddress)).length)
         .to.be.equal(0)
   })

   it ('properly handles internal mappings when invoking valid claim() for token', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockToken.transfer(signer2Address, 10000)
      await mockToken.approve(sendToHashMock.address, 10000)
      await mockToken.connect(signer2).approve(sendToHashMock.address, 10000)

      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 60, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHashMock.connect(signer2).sendToAnyone(signer2Hash, 110, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHashMock.sendToAnyone(signer1Hash, 75, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})
      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 90, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei})

      await sendToHashMock.connect(signer1).claim(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(true)

      expect((await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.have.members([signer2Address])

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect(await sendToHashMock.getPayerAssetMapAmount(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(110)
      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(110)

      await sendToHashMock.connect(signer2).claim(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)

      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(0)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer2Hash, ASSET_TYPE_TOKEN, mockToken.address, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_TOKEN, mockToken.address))
         .to.be.equal(false)
   })

   it ('properly handles internal mappings when invoking valid claim() for NFT', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      await mockNFT.transferFrom(ownerAddress, signer2Address, 0)
      await mockNFT.transferFrom(ownerAddress, signer2Address, 1)
      await mockNFT.transferFrom(ownerAddress, signer2Address, 2)
      await mockNFT.approve(sendToHashMock.address, 3)
      await mockNFT.approve(sendToHashMock.address, 4)
      await mockNFT.approve(sendToHashMock.address, 5)
      await mockNFT.connect(signer2).approve(sendToHashMock.address, 0)
      await mockNFT.connect(signer2).approve(sendToHashMock.address, 1)
      await mockNFT.connect(signer2).approve(sendToHashMock.address, 2)

      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 0, {value: dollarInWei})
      await sendToHashMock.connect(signer2).sendToAnyone(signer2Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei})
      await sendToHashMock.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 3, {value: dollarInWei})
      await sendToHashMock.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 4, {value: dollarInWei})
      await sendToHashMock.sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 5, {value: dollarInWei})
      await sendToHashMock.connect(signer2).sendToAnyone(signer1Hash, 1, ASSET_TYPE_NFT, mockNFT.address, 2, {value: dollarInWei})

      await sendToHashMock.connect(signer1).claim(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)

      expect((await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.have.members([signer2Address])
      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(0)

      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(true)

      await sendToHashMock.connect(signer2).claim(signer2Hash, ASSET_TYPE_NFT, mockNFT.address)

      expect((await sendToHashMock.getBeneficiaryPayersArray(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryPayersArray(signer2Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getPayerAssetMapAmount(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(0)
      expect((await sendToHashMock.getPayerAssetMapAssetIds(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).length)
         .to.be.equal(0)
      expect(await sendToHashMock.getBeneficiaryMapAmount(signer1Hash, ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, signer2Address)).length)
         .to.be.equal(0)
      expect((await sendToHashMock.getBeneficiaryMapAssetIds(signer1Hash, ASSET_TYPE_NFT, mockNFT.address, ownerAddress)).length)
         .to.be.equal(0)

      expect(await sendToHashMock.getBeneficiaryPayersMap(ownerAddress, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer1Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer1Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
      expect(await sendToHashMock.getBeneficiaryPayersMap(signer2Address, signer2Hash, ASSET_TYPE_NFT, mockNFT.address))
         .to.be.equal(false)
   })
})
