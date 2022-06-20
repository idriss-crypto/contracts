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

chai.use(solidity) // solidiity matchers, e.g. expect().to.be.revertedWith("message")
chai.use(chaiAsPromised) //eventually

const ASSET_TYPE_COIN = 0
const ASSET_TYPE_TOKEN = 1
const ASSET_TYPE_NFT = 2
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const negateBigNumber = (num: BigNumber): BigNumber => {
      return BigNumber.from(`-${num.toString()}`)
}

describe('SendToHashMock contract', () => {
   let owner: Signer;
   let signer1: Signer;
   let signer2: Signer;
   let signer3: Signer;
   let ownerAddress: string;
   let signer1Address: string;
   let signer2Address: string;
   let signer3Address: string;
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

      mockPriceOracle = (await waffle.deployContract(owner, MaticPriceAggregatorV3MockArtifact, [])) as MaticPriceAggregatorV3Mock
      idriss = (await waffle.deployContract(owner, IDrissArtifact, [signer2Address])) as IDriss
      sendToHashMock = (await waffle.deployContract(owner, SendToHashArtifact,
         [idriss.address, mockPriceOracle.address])) as SendToHashMock
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

   // it ('properly handles removal of assetIds from an array after claiming', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('properly removes one payer assets on revertPayment()', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('properly handles removal of assetIds from an array after reverting', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('properly handles adding and reverting/claiming the same asset over and over again', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

})
