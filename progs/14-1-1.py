from string import *
for x in printable[:29]:
    a = int('463'+x+'7921',29) + int('8241'+x+'153',29)
    if a%28==0:
        print(a//28)
        break