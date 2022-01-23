const IoTMicropayment = artifacts.require("IoTMicropayment");

contract("IoTMicropayment", () => {
    describe("支払い", async () => {
        let instance, buyer, seller;

        before(async () => {
            instance = await IoTMicropayment.deployed();

            const buyerPrivateKey = "0xa7cc8232ebd84cb2e7ec6548247958349245f2f7fa5ae8932ee685c3e4e337cc";
            const sellerPrivateKey = "0x68612f49e208e4520576b8d7c4a3a0a92099eff5ff0293c8783303a13eba92de";
            web3.eth.accounts.wallet.add(buyerPrivateKey);
            web3.eth.accounts.wallet.add(sellerPrivateKey);
            buyer = web3.eth.accounts.wallet[0];
            seller = web3.eth.accounts.wallet[1];
        });

        it("署名の検証", async () => {
            const actBuyer = async () => {
                const amount = 50;
                const nonce = 1;

                const hash = web3.utils.soliditySha3(
                    { t: "address", v: buyer.address },
                    { t: "uint256", v: amount },
                    { t: "uint256", v: nonce },
                    { t: "address", v: instance.address }
                ).toString("hex");
                const { signature } = await buyer.sign(hash);
                console.log(signature);
                // const signature  = await web3.eth.sign(hash, buyer.address);

                const params = [amount, nonce];
                return [params, signature];
            }

            const actSeller = async (params, signature) => {
                const options = { from: seller.address }
                const result = await instance.claimPayment(...params, signature, options);
                return result;
            }

            assert.equal(buyer.address, await instance.buyer());
            assert.equal(seller.address, await instance.seller());

            const [params, signature] = await actBuyer();
            await actSeller(params, signature);
        })
    });
});
