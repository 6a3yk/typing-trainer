from turtle import *
tracer(0)
screensize(3000,3000)
k = 20
lt(90)
for i in range(2):
    fd(14*k)
    lt(270)
    bk(12*k)
    rt(90)
up()
fd(9*k)
rt(90)
bk(7*k)
lt(90)
down()
for i in range(2):
    fd(13*k)
    rt(90)
    fd(6*k)
    rt(90)
up()
for x in range(-50,50):
    for y in range(-50,50):
        setpos(x*k,y*k)
        dot(3,'red')
done()