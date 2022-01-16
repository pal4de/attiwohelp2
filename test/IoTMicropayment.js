const IoTMicropayment = artifacts.require("IoTMicropayment");

contract("IoTMicropayment", (accounts) => {
    describe("System", async () => {
        let instance;
        const [buyer, seller, thirdperson] = accounts;
        before(async () => {
            instance = await IoTMicropayment.deployed();
        });

        // it("署名の検証", async () => {
        //     const publicKey = new BN("deadbeef", 16);

        //     await instance.setPubkey(publicKey);
        //     const ret = await instance.getPubkey(buyer);
        //     assert.equal(ret.toString(), publicKey.toString());
        // });

        /*
        it("データの送信", async () => {
            const hashed = 1;
            const price = new BN(100);
            await instance.addItem(hashed, price);
            const ret = await instance.getItem(hashed);

            const { "0": priceRet, "1": ownerRet } = ret;
            assert.equal(priceRet.toString(), price.toString());
            assert.equal(ownerRet, buyer);
        });

        it("データの購入", async () => {

            const hashed = 1;
            const encrypted = 2929291;
            const price = new BN(100);

            await instance.addItem(hashed, price, { from: seller });

            try {
                await instance.buyItem(hashed, { value: price });
                assert.fail();
            } catch (_) { }
            const ret = await instance.buyItem(hashed, {
                from: buyer,
                value: price,
            });
            const event = ret.logs.find((log) => log.event == "RequestedToSendData");
            if (!event) assert.fail();
            // @ts-expect-error
            // TruffleがTypeScriptをトランスパイルしないのが悪い
            const dealID = event.args[2];

            try {
                await instance.sendData(dealID, encrypted, { from: buyer });
                assert.fail();
            } catch (_) { }
            try {
                await instance.sendData(dealID, encrypted, { from: thirdperson });
                assert.fail();
            } catch (_) { }
            await instance.sendData(dealID, encrypted, { from: seller });

            try {
                await instance.acceptData(dealID, { from: buyer });
                assert.fail();
            } catch (_) { }
            try {
                await instance.acceptData(dealID, { from: thirdperson });
                assert.fail();
            } catch (_) { }
            await instance.acceptData(dealID, { from: buyer });
        });
        */
    })
});
