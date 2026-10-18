Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
' Si el servidor no responde en el puerto 3000, lo inicia oculto
Set http = CreateObject("MSXML2.ServerXMLHTTP")
On Error Resume Next
http.Open "GET", "http://localhost:3000/", False
http.setTimeouts 500, 500, 500, 500
http.Send
up = (Err.Number = 0)
On Error GoTo 0
If Not up Then
  sh.Run "cmd /c node server.js", 0, False
  WScript.Sleep 2000
End If
sh.Run "http://localhost:3000"
