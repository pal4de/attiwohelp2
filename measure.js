const iconv = require("iconv-lite");
const fs = require("fs");
const cliProgress = require('cli-progress');
const { assert } = require("console");
const IoTMicropayment = artifacts.require("IoTMicropayment");

class Parameter {
  constructor() {
    this.nonce = 0;
    this.amount = 0;
  }

  gen(amount, nonce = null) {
    this.amount += amount;
    return {
      nonce: nonce ?? this.nonce++,
      amount: this.amount,
    };
  }
}

class Csv {
  constructor(name, header) {
    this.length = header.length;
    this.name = name;
    this.body = header.join() + "\n";
  }

  add(...values) {
    if (values.length != this.length) {
      throw new Error("カラムの長さが一致しません");
    }
    this.body += values.join() + "\n";
  }

  writeOut() {
    const writer = fs.createWriteStream(`result/${this.name}.csv`);
    writer.write(iconv.encode(this.body, "Shift_JIS"));
    writer.end();
  }
}

const withProgress = (count, f) => {
  return async () => {
    const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progress.start(count, 0);
    await f(() => progress.increment());
    progress.stop();
  }
}

const ethInYen = 315620; // 2022年2月1日14:30現在 BitFlyerにて
const gasPrice = 112; // 2022年2月1日14:30現在 ETH GAS STATIONにて SAFE LOWを選択

const BN = (x) => new web3.utils.BN(x);

const balanceOf = async (address) => BigInt(await web3.eth.getBalance(address));

const weiToYen = (wei) => parseFloat(web3.utils.fromWei(`${wei}`, "ether")) * ethInYen;

contract("IoTMicropayment", ([buyer, seller, ...accounts]) => {
  describe("System", async () => {
    const newInstance = async (unitPriceInYen = 1) => {
      const calcUnitPrice = (ethInYen_, unitPriceInYen_) => {
        const unitPriceInMilliYen = BN(unitPriceInYen_ * 1000);

        const ethInYen = BN(ethInYen_);
        const ethInWei = web3.utils.toWei(BN(1), "ether");
        const yenInWei = ethInWei.div(ethInYen);

        return unitPriceInMilliYen.mul(yenInWei).div(BN(1000));
      }

      const unitPrice = calcUnitPrice(ethInYen, unitPriceInYen);
      const timeout = 0;
      const options = { value: unitPrice.mul(BN(100000)) };

      return await IoTMicropayment.new(
        seller,
        timeout,
        unitPrice,
        options
      );
    }

    const actBuyer = async (instance, { amount, nonce }) => {
      const hash = web3.utils.soliditySha3(
        { t: "address", v: buyer },
        { t: "uint256", v: amount },
        { t: "uint256", v: nonce },
        { t: "address", v: instance.address }
      ).toString("hex");
      return await web3.eth.sign(hash, buyer);
    }

    const actSeller = async (instance, { amount, nonce }, signature) => {
      const options = {
        from: seller,
        gasPrice: web3.utils.toWei(`${gasPrice}`, "gwei"),
      };
      const result = await instance.claimPayment(amount, nonce, signature, options);
      return result;
    }

    const tx = async (instance, params, amount = null) => {
      const balanceBefore = await balanceOf(seller);
      const signature = await actBuyer(instance, params);
      const result = await actSeller(instance, params, signature);
      const balanceAfter = await balanceOf(seller);

      const expected = BigInt(amount ?? params.amount) * BigInt(await instance.unitPrice());
      const actual = BigInt(balanceAfter) - BigInt(balanceBefore);
      const txFee = expected - actual;
      return [expected, actual, txFee];
    }

    let roughSurplusAmount, standardSurplusAmount;

    it("amountと手数料の関係", withProgress(50, async (increment) => {
      const csv = new Csv("amount", ["販売個数", "引き出し金額", "販売者の残高の変動量", "取引手数料"]);
      for (let amount = 200; amount <= 10000; amount += 200) {
        const instance = await newInstance();
        const params = { nonce: 1, amount };
        const [expected, actual, txFee] = await tx(instance, params);

        if (actual > 0 && !roughSurplusAmount) roughSurplusAmount = amount - 200;

        csv.add(amount, weiToYen(expected), weiToYen(actual), weiToYen(txFee));
        increment();
      }
      csv.writeOut();
    }));

    it("amountと手数料の関係 (細かく)", withProgress(200, async (increment) => {
      const csv = new Csv("amount-detail", ["販売個数", "引き出し金額", "販売者の残高の変動量", "取引手数料"]);
      for (let amount = roughSurplusAmount; amount <= roughSurplusAmount + 200; amount += 1) {
        const instance = await newInstance();
        const params = { nonce: 1, amount };
        const [expected, actual, txFee] = await tx(instance, params);

        if (actual > 0 && !standardSurplusAmount) standardSurplusAmount = amount;

        csv.add(amount, weiToYen(expected), weiToYen(actual), weiToYen(txFee));
        increment();
      }
      csv.writeOut();
    }));

    it("nonceと手数料の関係", withProgress(50, async (increment) => {
      const csv = new Csv("nonce", ["ナンス", "引き出し金額", "販売者の残高の変動量", "取引手数料"]);
      for (let nonce = 200; nonce <= 10000; nonce += 200) {
        const instance = await newInstance();
        const params = { nonce, amount: 1 };
        const [expected, actual, txFee] = await tx(instance, params);

        csv.add(nonce, weiToYen(expected), weiToYen(actual), weiToYen(txFee));
        increment();
      }
      csv.writeOut();
    }));

    it("単価と手数料の関係", withProgress(50, async (increment) => {
      const csv = new Csv("unitPrice", ["単価", "引き出し金額", "販売者の残高の変動量", "取引手数料"]);
      for (let unitPrice = 0.1; unitPrice <= 5; unitPrice += 0.1) {
        const instance = await newInstance(unitPrice);
        const params = { nonce: 1, amount: 1 };
        const [expected, actual, txFee] = await tx(instance, params);

        csv.add(unitPrice, weiToYen(expected), weiToYen(actual), weiToYen(txFee));
        increment();
      }
      csv.writeOut();
    }));

    it("引き出し回数と手数料の関係", withProgress(50, async (increment) => {
      const instance = await newInstance();
      const parameter = new Parameter();

      const csv = new Csv("sequential", ["販売個数", "引き出し金額", "販売者の残高の変動量", "取引手数料"]);
      for (let nonce = 200; nonce <= 10000; nonce += 200) {
        const params = parameter.gen(200);
        const [expected, actual, txFee] = await tx(instance, params, 1);

        csv.add(params.amount, weiToYen(expected), weiToYen(actual), weiToYen(txFee));
        increment();
      }
      csv.writeOut();
    }));

    it("単価と損益分岐点の関係", async () => {
      const multibar = new cliProgress.MultiBar({}, cliProgress.Presets.shades_classic);
      const unitPriceProgress = multibar.create(51, 1);

      const csv = new Csv("surplus", ["単価", "販売個数"]);
      for (let unitPrice = 0.1; unitPrice <= 5; unitPrice += 0.1) {
        const upperLimit = Math.floor(standardSurplusAmount * 1.1 / unitPrice);
        const amountProgress = multibar.create(upperLimit, 1);

        let roughAmount = 0;
        for (let amount = upperLimit; amount >= 0; amount -= 100) {
          const instance = await newInstance(unitPrice);
          const params = { amount, nonce: amount };
          const [expected, actual, txFee] = await tx(instance, params);

          if (actual < 0) {
            roughAmount = amount;
            break;
          } else {
            amountProgress.update(amount);
            if (amount < 0) assert.fail();
          }
        }

        for (let amount = roughAmount; amount <= upperLimit; amount++) {
          const instance = await newInstance(unitPrice);
          const params = { amount, nonce: amount };
          const [expected, actual, txFee] = await tx(instance, params);

          if (actual > 0) {
            csv.add(unitPrice, amount);
            break;
          } else {
            amountProgress.update(amount);
            if (amount == upperLimit) assert.fail();
          }
        }
        multibar.remove(amountProgress);

        unitPriceProgress.increment();
      }
      csv.writeOut();
      multibar.stop();
    });
  });
});
