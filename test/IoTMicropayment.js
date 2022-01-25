const IoTMicropayment = artifacts.require("IoTMicropayment");

contract("IoTMicropayment", ([buyer, seller, ...accounts]) => {
  describe("System", async () => {
    let instance;
    before(async () => {
      instance = await IoTMicropayment.deployed();
    });

    const balanceOf = async (address) => await web3.eth.getBalance(address);

    it("支払い", async () => {
      const actBuyer = async () => {
        // ヘッダ長 (？) が付与される必要がある
        const fixSignature = (original) => {
          const constant = 0x1bn;
          const added = (BigInt(original) + constant);
          return "0x" + added.toString(16).padStart(130, "0");
        }

        const makeSignature = async (amount, nonce) => {
          const hash = web3.utils.soliditySha3(
            { t: "address", v: buyer },
            { t: "uint256", v: amount },
            { t: "uint256", v: nonce },
            { t: "address", v: instance.address }
          ).toString("hex");
          return fixSignature(await web3.eth.sign(hash, buyer));
        }

        const amount = 10;
        const nonce = 1;

        const params = [amount, nonce];
        const signature = await makeSignature(amount, nonce);

        return [params, signature];
      }

      const actSeller = async (params, signature) => {
        const options = {
          from: seller,
          // gasPrice: web3.utils.toWei("1", "gwei"),
          gasPrice: 1,
        };
        const result = await instance.claimPayment(...params, signature, options);
        return result;
      }

      assert.equal(await instance.buyer(), buyer);
      assert.equal(await instance.seller(), seller);

      const balanceBefore = await balanceOf(seller);
      const [params, signature] = await actBuyer();
      const result = await actSeller(params, signature);
      const balanceAfter = await balanceOf(seller);
      console.log(result);

      assert.isOk(BigInt(balanceAfter) > BigInt(balanceBefore));

      console.log({
        before: balanceBefore,
        after: balanceAfter
      })
      const expectedEarning = BigInt(params[0]) * BigInt(await instance.unitPrice());
      const acctualEarning = BigInt(balanceAfter) - BigInt(balanceBefore);

      console.log("expected:", expectedEarning);
      console.log("acctual:", acctualEarning);
      console.log("diff:", expectedEarning - acctualEarning);
    })
  });
});
