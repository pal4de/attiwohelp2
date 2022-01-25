const IoTMicropayment = artifacts.require("IoTMicropayment");

class Parameter {
  constructor() {
    this.nonce = 0;
    this.amount = 0;
  }

  gen(amount) {
    this.amount += amount;
    return {
      nonce: this.nonce++,
      amount: this.amount,
    };
  }
}

const BN = (x) => web3.utils.BN(x);

const balanceOf = async (address) => BigInt(await web3.eth.getBalance(address));

contract("IoTMicropayment", ([buyer, seller, ...accounts]) => {
  describe("System", async () => {
    let instance;
    before(async () => {
      instance = await IoTMicropayment.deployed();
    });

    const parameter = new Parameter();

    const actBuyer = async ({ amount, nonce }) => {
      // ヘッダ長 (？) が付与される必要がある
      const fixSignature = (original) => {
        const constant = 0x1bn;
        const added = (BigInt(original) + constant);
        return "0x" + added.toString(16).padStart(130, "0");
      }

      const hash = web3.utils.soliditySha3(
        { t: "address", v: buyer },
        { t: "uint256", v: amount },
        { t: "uint256", v: nonce },
        { t: "address", v: instance.address }
      ).toString("hex");
      const signature = fixSignature(await web3.eth.sign(hash, buyer));
      return signature;
    }

    const actSeller = async ({ amount, nonce }, signature) => {
      const options = {
        from: seller,
        // gasPrice: web3.utils.toWei("1", "gwei"),
        gasPrice: 1,
      };
      const result = await instance.claimPayment(amount, nonce, signature, options);
      return result;
    }

    it("アドレスの一致", async () => {
      assert.equal(await instance.buyer(), buyer);
      assert.equal(await instance.seller(), seller);
    });

    it("単純な送金", async () => {
      const params = parameter.gen(10);

      const balanceBefore = await balanceOf(seller);
      const signature = await actBuyer(params);
      const result = await actSeller(params, signature);
      const balanceAfter = await balanceOf(seller);

      const expectedEarning = BigInt(params.amount) * BigInt(await instance.unitPrice());
      const acctualEarning = BigInt(balanceAfter) - BigInt(balanceBefore);

      console.log("expected:", expectedEarning);
      console.log("acctual:", acctualEarning);
      console.log("charge:", expectedEarning - acctualEarning);
    });

    it("パラメータ書き換えの拒否", async () => {
      const params = parameter.gen(10);
      const signature = await actBuyer(params);

      try {
        await actSeller({ ...params, amount: params.nonce + 10 }, signature);
        assert.fail();
      } catch (e) {
        assert.equal(e.reason, "signer does not matched", "amountの書き換えが拒否されていません");
      }

      try {
        await actSeller({ ...params, nonce: params.nonce + 1 }, signature);
        assert.fail();
      } catch (e) {
        assert.equal(e.reason, "signer does not matched", "nonceの書き換えが拒否されていません");
      }

      // 正常なパラメータなら成功
      await actSeller(params, signature);
    });

    it("複数回の送金", async () => {
      const unitPrice = BigInt(await instance.unitPrice());

      const claim = async (amount) => {
        const params = parameter.gen(amount);

        const balanceBefore = await balanceOf(seller);
        const signature = await actBuyer(params);
        const result = await actSeller(params, signature);
        const balanceAfter = await balanceOf(seller);

        const expectedEarning = BigInt(amount) * unitPrice;
        const acctualEarning = BigInt(balanceAfter) - BigInt(balanceBefore);
        const charge = expectedEarning - acctualEarning;
        return charge;
      }

      const charges = [
        await claim(10),
        await claim(10),
        await claim(10),
        await claim(20),
        await claim(20),
        await claim(30)
      ];
      console.log(charges);
    });
  });
});
