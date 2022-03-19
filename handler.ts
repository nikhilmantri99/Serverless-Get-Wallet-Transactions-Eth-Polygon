import Moralis from "moralis/node.js";
import fetch from "node-fetch";
import AWS from "aws-sdk";
const dynamoDb = new AWS.DynamoDB.DocumentClient();
AWS.config.update({region:'us-east-1'});
import {fetch_from_url,find_conversion_rate,covalent_logs,etherscan_logs,polygonscan_logs,value_from_hash,transaction_row} from './utils/variouslogs';
import {get_image_urls,get_inventory} from './utils/inventory_utils';
import {get_metrics_token_wise,get_metrics} from './utils/metric_utils';
import { utils } from "@project-serum/anchor";

async function return_NFT_transactions(userid,chain_name,waddress,pg_num=1){
    var to_update=false;
    var curr_txn_list=[];
    var txns_skipped=0;
    var txns_processed=0;
    const get_back = {
        TableName: "lambda-wallet-chain-transactions",
        Key: {
            walletId: waddress,
            chainName: chain_name,        },
    };
    const newResult = await dynamoDb.get(get_back).promise();
    if(newResult!=null && newResult.Item!=null){
        to_update=true;
        curr_txn_list=curr_txn_list.concat(newResult.Item["transactions"]);
        console.log("exists in the table.");
        txns_skipped=newResult.Item["txns_skipped"];
        txns_processed=newResult.Item["txns_processed"];
    }
    var transcations_list=[];
    const serverUrl = "https://kpvcez1i2tg3.usemoralis.com:2053/server";
    const appId = "viZCI1CZimCj22ZTyFuXudn3g0wUnG2pELzPvdg6";
    Moralis.start({ serverUrl, appId });
    var all_transfers=[];
    console.log("fetching...");
    var transfersNFT = await Moralis.Web3API.account.getNFTTransfers({ chain: chain_name, address: waddress, limit: 1});
    var total_nft_transfers_required=transfersNFT.total-(txns_processed+txns_skipped);
    console.log("Required total NFT transfers: ",total_nft_transfers_required);
    if(total_nft_transfers_required>1000){
        return {
            statusCode : 200,
            status : "Unsupported",
            body: "Sorry, we do not process wallets with more than 1000 txns currently!",
        }
    }
    if(total_nft_transfers_required>25){
        //let server_url= "http://localhost:3000/?wallet=";
        let server_url= "http://ec2-34-226-246-235.compute-1.amazonaws.com:3000/?wallet=";
        let part_wallet=waddress;
        let part2="&chain=";
        let part_chain=chain_name;
        let part3="&userid=";
        let part_userid=userid;
        server_url=server_url.concat(part_wallet,part2,part_chain,part3,part_userid);
        console.log(server_url);
        try{
            const ans = await fetch(server_url).then(response=>{return response.json();});
            return {
                statusCode : 200,
                status : "Processing",
                body: JSON.stringify(ans,null,2),
            }
        }
        catch(e){
            return {
                statusCode : 500,
                body: JSON.stringify(e),
                status: "ERROR",
                solution: "Try again after sometime!",
            }
        }
    }

    var n=0;
    while(all_transfers.length<total_nft_transfers_required){
        console.log("Here");
        transfersNFT = await Moralis.Web3API.account.getNFTTransfers({ chain: chain_name, address: waddress, offset: n*500});
        var cap=500;
        if(total_nft_transfers_required-all_transfers.length<cap){
            cap=total_nft_transfers_required-all_transfers.length;
        }
        all_transfers=all_transfers.concat(transfersNFT.result.slice(0,cap));
        console.log(all_transfers.length);
        n++;
    }

    console.log("For wallet address:",waddress," ,chain: ",chain_name,"total transactions:",all_transfers.length,"\nFollowing are the NFT Transaction values: ");
    let count=0;
    for(let i=0;i<all_transfers.length;i++){
        var txn_row=await transaction_row(all_transfers[i],waddress,chain_name,userid,txns_processed,txns_skipped,count);
        var this_transaction=txn_row[0];
        txns_processed=txn_row[1];
        txns_skipped=txn_row[2];
        count=txn_row[3];
        if(this_transaction!=null) transcations_list.push(this_transaction);
    }

    //update list by also adding existing txns from the table
    if(curr_txn_list.length!=0){
        transcations_list=transcations_list.concat(curr_txn_list);
    }

    const q={chain:chain_name,address: waddress};
    const inventory_NFTS=await Moralis.Web3API.account.getNFTs(q);
    //console.log(inventory_NFTS.result);
    //console.log("NFTs in inventory using Moralis: ",inventory_NFTS.result.length);
    var metrics_;
    if(chain_name=="polygon"){
        metrics_=await get_metrics_token_wise(transcations_list,inventory_NFTS.result,null,true);
    }
    else{
        metrics_=await get_metrics_token_wise(transcations_list,inventory_NFTS.result);
    }
    const metrics=metrics_[0];
    const inventory_things=metrics_[1];
    var total_pages;
    if(transcations_list.length%50==0) total_pages= Math.floor(transcations_list.length/50);
    else total_pages= Math.floor(transcations_list.length/50)+1;
    var curr_page=pg_num;
    if(curr_page>total_pages){
        curr_page=total_pages;
    }
    const transactions={
        TableName: get_back.TableName,
        Item: {
            walletId :get_back.Key.walletId,
            chainName : get_back.Key.chainName,
            transactions: transcations_list,
            total_pages: total_pages,
            curr_page: curr_page,
            txns_skipped : txns_skipped,
            txns_processed : txns_processed,
            overall_metrics : metrics["overall_metrics"],
            token_wise_metrics: metrics,
            inventory_NFTS: inventory_things,
        }
    }
    try{
        await dynamoDb.put(transactions).promise();
        const response_body = await dynamoDb.get(get_back).promise();
        var total_len=response_body.Item["transactions"].length;
        if(pg_num>=total_pages) response_body.Item["transactions"]=response_body.Item["transactions"].slice((total_pages-1)*50,total_len);
        else response_body.Item["transactions"]=response_body.Item["transactions"].slice((pg_num-1)*50,pg_num*50);
        return {
            statusCode: 200,
            status: "Success",
            body: response_body,
        };
    }
    catch(e){
        console.log("Error is found....");
        console.log(e);
        return {
            statusCode: 500,
            status: "ERROR",
            body: JSON.stringify({ error: e.message }),
        };
    }
}

//export async function handler(event, context){
export const hello = async (event, context)=>{
    const wallet = event["queryStringParameters"]['wallet'];
    //const wallet = "0x4958cde93218e9bbeaa922cd9f8b3feec1342772";
    if(wallet==null){
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "No wallet provided." }),
        };
    }
    let userId = event["queryStringParameters"]['userid'];
    //let userId = "1";
    if(userId==null){
        userId="1";
    }
    let chain_name= event["queryStringParameters"]['chain'];
    //let chain_name="eth";
    if(chain_name==null){
        chain_name="eth";
    }
    let pg_num=event["queryStringParameters"]['page_number'];
    if(pg_num==null){
        pg_num=1;
    }
    else{
        pg_num=parseInt(pg_num);
    }
    const ans= await return_NFT_transactions(userId,chain_name,wallet,pg_num);
    var sc=200;
    var status="ERROR";
    if(ans["statusCode"]!=null){
        sc=ans["statusCode"];
    }
    if(ans["status"]!=null){
        status=ans["status"];
    }
    const response = {
        statusCode: sc,
        headers: {
            "my_header": "my_value"
        },
        body:JSON.stringify(ans,null,2),
        isBase64Encoded: false
    };
    return response;
};

