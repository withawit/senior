function loadHTMLComponent(componentId, url) {
    //componentId = id div จากหน้าเว็บที่ต้องการให้ componenets ไปแสดง 
    //url = Path of file components
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
        if (this.readyState === 4 && this.status === 200) {
            document.getElementById(componentId).innerHTML = this.responseText;
        }
    };
    xhr.open("GET", url, true);
    xhr.send();
}