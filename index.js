const Web3 = require("web3");
const IoTMicropayment = require("./build/contracts/IoTMicropayment.json");

const contractAddress = "0xB1f0aF7f2706F058E5853F9234Be07EcD177e041";

const actBuyer = async () => {
    const web3 = new Web3("http://localhost:8545");
    const privateKey = "0x4689a6c855240d6dd67e3eebc997f88b6e4f60956d977b28f3c0213cb9e38480";
    web3.eth.accounts.wallet.add(privateKey);
    const buyer = web3.eth.accounts.wallet[0];

    const amount = 50;
    const nonce = 1;

    const hash = web3.utils.soliditySha3(
        { t: "address", v: buyer.address },
        { t: "uint256", v: amount },
        { t: "uint256", v: nonce },
        { t: "address", v: contractAddress }
    ).toString("hex");
    const signed = buyer.sign(hash, privateKey);

    const params = [buyer.address, amount, nonce];

    return [params, signed.signature];
}

const actSeller = async (params, signature) => {
    const web3 = new Web3("http://localhost:8545");
    const privateKey = "0x0e1ebb3cfbf6086f25fc40e66b8e368958217c2ee88cd1eca31780dc64bce844";
    web3.eth.accounts.wallet.add(privateKey);
    const seller = web3.eth.accounts.wallet[0];

    const contract = new web3.eth.Contract(IoTMicropayment.abi, contractAddress);
    const { verifySignature } = contract.methods;

    const result = await verifySignature(...params, signature).call();
    return result;
}

const main = async () => {
    const [params, signature] = await actBuyer();
    const result = await actSeller(params, signature);
    console.log(result);
};

main();
