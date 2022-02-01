// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

contract IoTMicropayment {
    address public seller;
    address public buyer;

    uint256 public timeout;
    uint256 public unitPrice;
    uint256 public withdrawed;

    constructor(
        address _seller,
        uint256 _timeout,
        uint256 _unitPrice
    ) payable {
        require(msg.value > 0, "deposit amount is not enough");
        buyer = msg.sender;
        seller = _seller;
        timeout = _timeout;
        unitPrice = _unitPrice;
    }

    modifier onlySeller() {
        require(msg.sender == seller, "you are not the seller");
        _;
    }

    function claimPayment(
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) external onlySeller {
        require(
            verifySignature(buyer, amount, nonce, signature),
            "signer does not matched"
        );
        require(
            amount * unitPrice > withdrawed,
            "transfer amount is under zero"
        );

        uint256 amountToSend = amount * unitPrice - withdrawed;
        withdrawed = amount * unitPrice;
        payable(seller).transfer(amountToSend);
    }

    function claimTimeout() external {
        require(timeout <= block.timestamp, "not yet timed out");
        selfdestruct(payable(buyer));
    }

    function verifySignature(
        address signer,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) internal view returns (bool isValid) {
        bytes32 message = prefixed(
            keccak256(abi.encodePacked(signer, amount, nonce, this))
        );
        return recoverSigner(message, signature) == signer;
    }

    function recoverSigner(bytes32 message, bytes memory signature)
        internal
        pure
        returns (address signer)
    {
        (uint8 v, bytes32 r, bytes32 s) = splitSignature(signature);

        return ecrecover(message, v, r, s);
    }

    function splitSignature(bytes memory signature)
        internal
        pure
        returns (
            uint8 v,
            bytes32 r,
            bytes32 s
        )
    {
        require(signature.length == 65, "invalid signature length");

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        return (v, r, s);
    }

    function prefixed(bytes32 _hash) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash)
            );
    }
}
