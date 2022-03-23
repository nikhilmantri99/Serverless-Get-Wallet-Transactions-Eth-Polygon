import Moralis from "moralis/node.js";
import fetch from "node-fetch";
import AWS from "aws-sdk";
const dynamoDb = new AWS.DynamoDB.DocumentClient();
AWS.config.update({
    accessKeyId:"AKIA2F4FHJNULPGDQMV5",
    secretAccessKey:"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",
    region:'us-east-1'});

const TXNS_ETHEREUM_TABLE="portfolio-ethereum-txns";
const TXNS_POLYGON_TABLE="portfolio-polygon-txns";
const INVENTORY_ETHEREUM_TABLE="portfolio-ethereum-inventory";
const INVENTORY_POLYGON_TABLE="portfolio-polygon-inventory";
const OVERALL_METRIC_TABLE="portfolio-overall-metrics";
const TOKENWISE_METRIC_ETHEREUM_TABLE="portfolio-tokenwise-metrics-ethereum";
const TOKENWISE_METRIC_POLYGON_TABLE="portfolio-tokenwise-metrics-polygon";

export async function get_total_pages(total_txns,n=50){
    var total_pages=0;
    if(total_txns%n==0) total_pages= Math.floor(total_txns/n);
    else total_pages= Math.floor(total_txns/n)+1;
    return total_pages;
}

export async function put_list_in_table_with_pagination(Table_name,waddress,tlist,n=50,obj=null){
    console.log("populating table", Table_name);
    var total_pages=await get_total_pages(tlist.length,n);
    console.log("total_pages:",total_pages);
    for(var i=1;i<=total_pages;i++){
        var temp_list=tlist.slice((i-1)*n,Math.min(i*n,tlist.length));
        var to_put={
            walletId : waddress,
            pg: i,
            total_pages: total_pages,
            total_number: tlist.length,
            list: temp_list,
        }
        if(obj!=null){
            to_put["info"]=obj;
        }
        const put_in={
            TableName: Table_name,
            Item: to_put,
        };
        console.log(put_in);
        try{
            await dynamoDb.put(put_in).promise();
        }
        catch(e){
            console.log(e);
        }
    }
}

export async function get_list_from_table_with_pagination(Table_name,waddress){
    var tlist=[];
    var get_back={
        TableName: Table_name,
        Key: {
            walletId: waddress,
            pg : 1
        }
    };
    var newResult = await dynamoDb.get(get_back).promise();
    if(newResult!=null && newResult.Item!=null){
        tlist=tlist.concat(newResult.Item["list"]);
        var total_pages=newResult.Item["total_pages"];
        for(var i=2;i<=total_pages;i++){
            get_back.Key.pg=i;
            newResult=await dynamoDb.get(get_back).promise();
            tlist=tlist.concat(newResult.Item["list"]);
        }
        return tlist;
    }
    return null;
}

export async function get_page_from_table_with_pagination(TableName,Waddress,page_number=1){
    var get_back={
        TableName: TableName,
        Key:{
            walletId: Waddress,
            pg: 1
        }
    };
    var curr_page=page_number;
    var newResult = await dynamoDb.get(get_back).promise();
    if(newResult!=null && newResult.Item!=null){
        if(curr_page>newResult.Item["total_pages"]){
            curr_page=newResult.Item["total_pages"];
        }
        else if(curr_page<1){
            curr_page=1;
        }
    }
    else{
        return null;
    }
    var get_back={
        TableName: TableName,
        Key:{
            walletId: Waddress,
            pg: curr_page
        }
    };
    newResult = await dynamoDb.get(get_back).promise();
    if(newResult!=null && newResult.Item!=null){
        if(newResult.Item["info"]==null) return [newResult.Item["list"],newResult.Item["total_pages"],newResult.Item["total_number"],curr_page];
        else return [newResult.Item["list"],newResult.Item["total_pages"],newResult.Item["total_number"],curr_page,newResult.Item["info"]];
    }
    return null;
}

export async function put_txns(waddress,chain_name,tx_list,txns_processed,txns_skipped,n=50){
    if(tx_list==null){
        return;
    }
    var table_name=TXNS_ETHEREUM_TABLE;
    if(chain_name=="polygon"){
        table_name=TXNS_POLYGON_TABLE;
    }
    var obj={
        txns_processed: txns_processed,
        txns_skipped: txns_skipped,
    };
    await put_list_in_table_with_pagination(table_name,waddress,tx_list,n,obj);
}

export async function get_all_txns(waddress,chain_name){
    var table_name=TXNS_ETHEREUM_TABLE;
    if(chain_name=="polygon"){
        table_name=TXNS_POLYGON_TABLE;
    }
    var tlist = await get_list_from_table_with_pagination(table_name,waddress);
    return tlist;
}

export async function get_page_txns(waddress,chain_name,pg_num=1){
    var table_name=TXNS_ETHEREUM_TABLE;
    if(chain_name=="polygon"){
        table_name=TXNS_POLYGON_TABLE;
    }
    var ls=await get_page_from_table_with_pagination(table_name,waddress,pg_num);
    if(ls!=null){
        var txns_processed=ls[4]["txns_processed"];
        var txns_skipped=ls[4]["txns_skipped"];
        return [ls[0],ls[1],ls[2],ls[3],txns_processed,txns_skipped];
    }
    return[null,0,0,0,0,0];
}

export async function put_inventory(waddress,chain_name,tx_list,n=50){
    if(tx_list==null){
        return;
    }
    var table_name=INVENTORY_ETHEREUM_TABLE;
    if(chain_name=="polygon"){
        table_name=INVENTORY_POLYGON_TABLE;
    }
    await put_list_in_table_with_pagination(table_name,waddress,tx_list,n);
}

export async function get_all_inventory(waddress,chain_name){
    var table_name=INVENTORY_ETHEREUM_TABLE;
    if(chain_name=="polygon"){
        table_name=INVENTORY_POLYGON_TABLE;
    }
    var tlist = await get_list_from_table_with_pagination(table_name,waddress);
    return tlist;
}

export async function get_page_inventory(waddress,chain_name,pg_num=1){
    var table_name=INVENTORY_ETHEREUM_TABLE;
    if(chain_name=="polygon"){
        table_name=INVENTORY_POLYGON_TABLE;
    }
    var ls=await get_page_from_table_with_pagination(table_name,waddress,pg_num);
    if(ls==null) ls=[null,0,0,0]
    return ls;
}


export async function put_tokenwisemetrics(waddress,chain_name,tx_list,n=50){
    if(tx_list==null){
        return;
    }
    var table_name=TOKENWISE_METRIC_ETHEREUM_TABLE;
    if(chain_name=="polygon"){
        table_name=TOKENWISE_METRIC_POLYGON_TABLE;
    }
    await put_list_in_table_with_pagination(table_name,waddress,tx_list,n);
}

export async function get_all_tokenwisemetrics(waddress,chain_name){
    var table_name=TOKENWISE_METRIC_ETHEREUM_TABLE;
    if(chain_name=="polygon"){
        table_name=TOKENWISE_METRIC_POLYGON_TABLE;
    }
    var tlist = await get_list_from_table_with_pagination(table_name,waddress);
    return tlist;
}

export async function get_page_tokenwisemetrics(waddress,chain_name,pg_num=1){
    var table_name=TOKENWISE_METRIC_ETHEREUM_TABLE;
    if(chain_name=="polygon"){
        table_name=TOKENWISE_METRIC_POLYGON_TABLE;
    }
    var ls=await get_page_from_table_with_pagination(table_name,waddress,pg_num);
    if(ls==null) ls=[null,0,0,0];
    return ls;
}

export async function put_overall_metrics(waddress,chain_name,overall_metrics){
    var table_name=OVERALL_METRIC_TABLE;
    var toput={
        TableName: table_name,
        Item:{
            walletId: waddress,
            chain_name: chain_name,
            info : overall_metrics
        }
    }
    try{
        await dynamoDb.put(toput).promise();
    }
    catch(e){
        console.log(e);
    }
}

export async function get_overall_metrics(waddress,chain_name){
    var table_name=OVERALL_METRIC_TABLE;
    var get_back={
        TableName: table_name,
        Key:{
            walletId: waddress,
            chain_name: chain_name
        }
    }
    var newResult = await dynamoDb.get(get_back).promise();
    if(newResult!=null && newResult.Item!=null){
        return newResult.Item["info"];
    }
    return null;
}





