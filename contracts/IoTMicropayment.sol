// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

// 参考: https://solidity-jp.readthedocs.io/ja/latest/solidity-by-example.html

contract IoTMicropayment {
    address public seller;
    address public buyer;

    uint256 public startDate;
    uint256 public timeout;

    uint256 public unitPrice;
    mapping(bytes32 => address) private signatures;

    mapping(uint256 => bool) usedNonces;

    constructor(
        address _seller,
        uint256 _timeout,
        uint256 _unitPrice
    ) payable {
        require(msg.value > 0, "");
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
    ) public onlySeller {
        require(!usedNonces[nonce]);
        usedNonces[nonce] = true;

        bytes32 message = prefixed(
            keccak256(abi.encodePacked(msg.sender, amount, nonce, this))
        );
        require(
            recoverSigner(message, signature) == buyer,
            "signer does not matched"
        );

        payable(seller).transfer(amount);
    }

    function channelTimeout() public {
        require(startDate + timeout <= block.timestamp, "not yet timed out");
        selfdestruct(payable(buyer));
    }

    function recoverSigner(bytes32 message, bytes memory signature)
        internal
        pure
        returns (address)
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

    function prefixed(bytes32 hash) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
            );
    }
}