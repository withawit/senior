const express = require("express");
const path = require("path");
const app = express();

app.get("/",function(req,res){
    res.sendFile(path.join(__dirname, "views/homepage.html"));
});

const port = 3000;
app.listen(port,function(){
    console.log("server is ready at " + port);
});