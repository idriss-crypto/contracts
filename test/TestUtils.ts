import { BigNumber } from "ethers"
import crypto from 'crypto'

const negateBigNumber = (num: BigNumber): BigNumber => {
      return BigNumber.from(`-${num.toString()}`)
      
}

const hashIDriss = async (identifier: string, claimPassword: string): Promise<string> => {
   //id + user pass for IDriss + Metamask ETH wallet tag
   const message = identifier + '' + '5d181abc9dcb7e79ce50e93db97addc1caf9f369257f61585889870555f8c321'; 
   const digestedMessage = await digestMessage(message)
   return await digestMessage(digestedMessage + claimPassword)
}

const digestMessage = async(message: string):Promise<string> => {
   return crypto.createHash('sha256').update(message).digest('hex');
}

export { negateBigNumber, hashIDriss }