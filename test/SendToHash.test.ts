import { ethers, waffle } from 'hardhat'
import { Signer } from 'ethers'
import chai, { expect } from 'chai'
import { IDriss } from '../src/types/IDriss'
import IDrissArtifact from '../src/artifacts/src/contracts/IDrissRegistryMock.sol/IDriss.json'
import { MockNFT } from '../src/types/MockNFT'
import MockNFTArtifact from '../src/artifacts/src/contracts/IDrissRegistryMock.sol/MockNFT.json'
import MockTokenArtifact from '../src/artifacts/src/contracts/IDrissRegistryMock.sol/MockToken.json'
import { MockToken } from '../src/types/MockToken'
import { SendToHash } from '../src/types/SendToHash'
import SendToHashArtifact from '../src/artifacts/src/contracts/SendToHash.sol/SendToHash.json'
import chaiAsPromised from 'chai-as-promised'
import { MockProvider, solidity } from 'ethereum-waffle'

chai.use(solidity) // solidiity matchers, e.g. expect().to.be.revertedWith("message")
chai.use(chaiAsPromised) //eventually

const ASSET_TYPE_COIN = 0
const ASSET_TYPE_TOKEN = 1
const ASSET_TYPE_NFT = 2
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

describe('SendToHash contract', () => {
   let accounts: Signer[];
   let owner: Signer;
   let signer1: Signer;
   let signer2: Signer;
   let signer3: Signer;
   let ownerAddress: string;
   let signer1Address: string;
   let signer2Address: string;
   let signer3Address: string;
   let sendToHash: SendToHash
   let idriss: IDriss
   let mockToken: MockToken
   let mockNFT: MockNFT
   let NFT_ID_ARRAY = [... Array(10).keys()]
   let provider: MockProvider

   beforeEach(async () => {
      provider = new MockProvider({ ganacheOptions: { gasLimit: 100000000 } })
      accounts = provider.getWallets();
      [owner, signer1, signer2, signer3] = accounts;
      ownerAddress = await owner.getAddress()
      signer1Address = await signer1.getAddress()
      signer2Address = await signer2.getAddress()
      signer3Address = await signer3.getAddress()

      mockToken = (await waffle.deployContract(owner, MockTokenArtifact, [])) as MockToken
      mockNFT = (await waffle.deployContract(owner, MockNFTArtifact, [])) as MockNFT
      idriss = (await waffle.deployContract(owner, IDrissArtifact, [signer2Address])) as IDriss
      sendToHash = (await waffle.deployContract(owner, SendToHashArtifact, [60 * 60 * 24 * 7, idriss.address])) as SendToHash

      await new Promise(resolve => { setTimeout(resolve, 1000); });

      // unfortunately we can't use Promise.all, because transaction nonces got wrecked by concurrency
      NFT_ID_ARRAY.forEach( async (val, idx, _) => { 
         await mockNFT.safeMint(signer1Address, val)
      })

      await new Promise(resolve => { setTimeout(resolve, 1000); });
   })

   it('reverts sendToAnyone when conditions are not met', async () => {
      await expect(sendToHash.sendToAnyone('a', 0, ASSET_TYPE_COIN, ZERO_ADDRESS, [])).to.be.revertedWith('Transferred value has to be bigger than 0')
      await new Promise(resolve => { setTimeout(resolve, 1000); });
   })

   it('reverts sendToAnyone when conditions are not met 2', async () => {
      await expect(sendToHash.sendToAnyone('a', 0, ASSET_TYPE_TOKEN, ZERO_ADDRESS, [])).to.be.revertedWith('Asset value has to be bigger than 0')
   })

   it('reverts sendToAnyone when conditions are not met 3', async () => {
      await expect(sendToHash.sendToAnyone('a', 0, ASSET_TYPE_NFT, ZERO_ADDRESS, [])).to.be.revertedWith('Asset value has to be bigger than 0')
   })

   // it('returns expected URL for a token', async () => {
   //    await sendToHash.safeMint(signer2Address, 'externalidx3', 3)

   //    expect("http://example.com/externalidx3").to.be.eq(await sendToHash.tokenURI(3))
   //    await expect(sendToHash.tokenURI(1)).to.be.revertedWith('ERC721URIStorage: URI query for nonexistent token')
   // })
})
