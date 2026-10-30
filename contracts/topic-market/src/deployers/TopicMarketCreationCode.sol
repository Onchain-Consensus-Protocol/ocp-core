// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarketCreationCodeStore} from "./TopicMarketCreationCodeStore.sol";

/// @dev Internal-only helpers; no external library, owner or new deployment authority.
library TopicMarketCreationCode {
    uint256 internal constant CHUNK_SIZE=24000;

    function store(bytes memory creation) internal returns(address codeA,address codeB,uint256 lengthA,uint256 lengthB) {
        lengthA=creation.length>CHUNK_SIZE?CHUNK_SIZE:creation.length;
        lengthB=creation.length-lengthA;
        require(lengthB<=CHUNK_SIZE,"INITCODE_SIZE");
        bytes memory a=new bytes(lengthA);bytes memory b=new bytes(lengthB);
        // 仅复制到各自已分配的word padding；数据仓返回精确长度，不把padding当创建码。
        assembly {
            let source := add(creation,32)
            for {let i := 0} lt(i,lengthA) {i := add(i,32)} {
                mstore(add(add(a,32),i),mload(add(source,i)))
            }
            for {let i := 0} lt(i,lengthB) {i := add(i,32)} {
                mstore(add(add(b,32),i),mload(add(add(source,lengthA),i)))
            }
        }
        codeA=address(new TopicMarketCreationCodeStore(a));
        codeB=address(new TopicMarketCreationCodeStore(b));
    }

    function read(address codeA,address codeB,uint256 lengthA,uint256 lengthB) internal view returns(bytes memory creation) {
        creation=new bytes(lengthA+lengthB);
        // 头部STOP占一字节；两段仅按记录的精确长度拼接，不依赖完整word对齐。
        assembly {
            extcodecopy(codeA,add(creation,32),1,lengthA)
            extcodecopy(codeB,add(add(creation,32),lengthA),1,lengthB)
        }
    }

    function deploy(address codeA,address codeB,uint256 lengthA,uint256 lengthB,bytes memory arguments)
        internal returns(address deployed)
    {
        bytes memory initcode=abi.encodePacked(read(codeA,codeB,lengthA,lengthB),arguments);
        assembly { deployed := create(0,add(initcode,32),mload(initcode)) }
    }
}
