from turtle import *
tracer(0)
screensize(3000,3000)
k = 50
lt(90)
rt(315)
for i in range(7):
    fd(16*k)
    rt(45)
    fd(8*k)
    rt(135)
up()
for x in range(-50,50):
    for y in range(-50,50):
        setpos(x*k,y*k)
        dot(3,'red')
done()