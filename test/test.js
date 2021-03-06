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
      const hash = web3.utils.soliditySha3(
        { t: "address", v: buyer },
        { t: "uint256", v: amount },
        { t: "uint256", v: nonce },
        { t: "address", v: instance.address }
      ).toString("hex");
      return await web3.eth.sign(hash, buyer);
    }

    const actSeller = async ({ amount, nonce }, signature) => {
      const options = {
        from: seller,
        gasPrice: web3.utils.toWei("1", "gwei"),
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
        assert.fail("amountの書き換えが拒否されていません");
      } catch (e) {
        assert.equal(e.reason, "signer does not matched");
      }

      try {
        await actSeller({ ...params, nonce: params.nonce + 1 }, signature);
        assert.fail("nonceの書き換えが拒否されていません");
      } catch (e) {
        assert.equal(e.reason, "signer does not matched");
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

    it("amoutが足りないとき拒否", async () => {
      const params1 = parameter.gen(10);
      const signature1 = await actBuyer(params1);

      const params2 = parameter.gen(10);
      const signature2 = await actBuyer(params2);

      await actSeller(params2, signature2);
      try {
        await actSeller(params1, signature1);
        assert.fail("amoutが足りないとき拒否できていません");
      } catch (e) {
        assert.equal(e.reason, "transfer amount is under zero");
      }
    });

    it("タイムアウト", async () => {
      const balanceBefore = await balanceOf(buyer);
      await instance.claimTimeout({ from: buyer });
      const balanceAfter = await balanceOf(buyer);
      assert.isOk(balanceBefore < balanceAfter);
    });
  });
});
