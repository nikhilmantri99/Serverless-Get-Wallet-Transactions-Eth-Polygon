import Moralis from "moralis/node.js";
import fetch from "node-fetch";
import AWS from "aws-sdk";
AWS.config.update({region:'us-east-1'});
const dynamoDb = new AWS.DynamoDB.DocumentClient();

import {return_NFT_transactions,return_state,call_server, fetch_from_url,find_conversion_rate,covalent_logs,etherscan_logs,polygonscan_logs,value_from_hash,transaction_row} from './utils/variouslogs';
import {get_image_urls,get_inventory} from './utils/inventory_utils';
import {get_metrics_token_wise,get_metrics} from './utils/metric_utils';
//import { utils } from "@project-serum/anchor";
import {get_total_pages,put_txns,get_all_txns,get_page_txns,put_inventory,get_all_inventory,get_page_inventory,
        put_tokenwisemetrics,get_all_tokenwisemetrics,get_page_tokenwisemetrics,put_overall_metrics,get_overall_metrics} from "./utils/dynamodb_utils";

//export async function handler(event, context){
export const hello = async (event, context)=>{
    var wallet = event["queryStringParameters"]['wallet'];
    //const wallet = "0x4958cde93218e9bbeaa922cd9f8b3feec1342772";
    if(wallet==null){
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "No wallet provided." }),
        };
    }
    wallet=String(wallet).toLowerCase();
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
    let txn_page=event["queryStringParameters"]['txn_page'];
    if(txn_page==null){
        txn_page=1;
    }
    else{
        txn_page=parseInt(txn_page);
    }
    let inventory_page=event["queryStringParameters"]['inventory_page'];
    if(inventory_page==null){
        inventory_page=1;
    }
    else{
        inventory_page=parseInt(inventory_page);
    }
    let token_page=event["queryStringParameters"]['token_page'];
    if(token_page==null){
        token_page=1;
    }
    else{
        token_page=parseInt(token_page);
    }
    const ans= await return_NFT_transactions(userId,chain_name,wallet,txn_page,inventory_page,token_page);
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

