import Moralis from "moralis/node.js";
import fetch from "node-fetch";
import AWS from "aws-sdk";
const dynamoDb = new AWS.DynamoDB.DocumentClient();
AWS.config.update({region:'us-east-1'});
import {get_inventory} from './inventory_utils';

export async function get_metrics(ls,token_address,isoverall=false,inventory_NFTs=null,current_inventory_list=null,ispolygon=false){ //ls: list of transactions
    var revenue=0;
    var spending=0;
    var ROI=0;
    var inventory_value=0;
    for(var i=0;i<ls.length;i++){
        if(ls[i]["activity"]=="Bought"){
            spending+=ls[i]["net_value"];
        }
        else{
            revenue+=ls[i]["net_value"];
        }
    }
    var investment=0;
    var returns=0;
    var dict={};
    for(var i=ls.length-1;i>=0;i--){
        var NFTstring=ls[i]["tokenaddress"].concat(ls[i]["tokenid"]);
        if (ls[i]["activity"]=="Bought"){
            dict[NFTstring]=ls[i]["net_value"];
        }
        else if(dict[NFTstring]!=null && ls[i]["activity"]=="Sold"){
            investment+=dict[NFTstring];
            returns+=ls[i]["net_value"];
            delete dict[NFTstring];
        }
        else{
            delete dict[NFTstring];
        }
    }
    if(investment!=0) {
        ROI=(returns-investment)*100/investment;
    }
    var i=0;
    for(var key in dict){
        i++;
        inventory_value+=dict[key];
    }
    const return_val= {
        token_address: token_address,
        revenue : revenue,
        spending : spending,
        ROI : ROI,
        inventory_value: inventory_value
    }
    var ans;
    if(isoverall==true && inventory_NFTs!=null){
        console.log("Total NFTs in inventory from txns:",i);
        ans=await get_inventory(dict,inventory_NFTs,current_inventory_list,ispolygon);
        return [return_val,ans];
    }
    return return_val;
}

export async function get_metrics_token_wise(ls,inventory_NFTs=null,curr_inventory_list=null,ispolygon=false){
    var dict={};
    for(var i=0;i<ls.length;i++){
        var token_address=ls[i]["tokenaddress"];
        if(dict[token_address]!=null){
            //console.log("in here we flyyyyy.....")
            dict[token_address].push(ls[i]);
        }
        else{
            //console.log("in here we go.....")
            dict[token_address]=[];
            dict[token_address].push(ls[i]);
        }
    }
    var token_wise_metrics=[];
    console.log("Important metrics, tokenwise, are as follows:")
    for(var key in dict){
        var ans =await get_metrics(dict[key],key);
        token_wise_metrics.push(ans);
    }
    var finale=await get_metrics(ls,"overall_metrics",true,inventory_NFTs,curr_inventory_list,ispolygon);
    var overall_metrics=finale[0];
    var inventory_things=finale[1];
    console.log("overall_metrics",overall_metrics);
    return [overall_metrics,token_wise_metrics,inventory_things];
}